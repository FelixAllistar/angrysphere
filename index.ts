#!/usr/bin/env bun

import { 
  CliRenderer, 
  ThreeCliRenderer, 
  GroupRenderable, 
  TextRenderable, 
  MouseEvent, 
  Renderable, 
  RGBA, 
  createCliRenderer,
  SpriteAnimator,
  TiledSprite,
  type SpriteDefinition,
  type AnimationDefinition,
  SpriteResourceManager,
  type ResourceConfig,
  TextureUtils
} from "./opentui-src/index"
import * as THREE from "three"
import { MeshLambertNodeMaterial } from "three/webgpu"
import RAPIER from "@dimforge/rapier2d-simd-compat"

// @ts-ignore
import cratePath from "./assets/crate.png" with { type: "image/png" }
// @ts-ignore
import birdPath from "./assets/heart.png" with { type: "image/png" }

// @ts-ignore
import backgroundPath from "./assets/forrest_background.png" with { type: "image/png" }

const WORLD_HEIGHT = 20.0
const GRAVITY = { x: 0.0, y: -9.81 }
const LAUNCH_POWER_MULTIPLIER = 8.0
const MAX_LAUNCH_DISTANCE = 4.0


interface PhysicsObject {
  rigidBody: RAPIER.RigidBody
  sprite: TiledSprite
  width: number
  height: number
  id: string
  type: 'bird' | 'box'
}


interface GameState {
  engine: ThreeCliRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  resourceManager: SpriteResourceManager
  spriteAnimator: SpriteAnimator
  physicsWorld: RAPIER.World
  ground: RAPIER.Collider
  objects: PhysicsObject[]

  // Bird launching
  bird: PhysicsObject | null
  birdStartPosition: THREE.Vector3
  isDragging: boolean
  dragOffset: THREE.Vector2
  launchDirection: THREE.Vector2

  // Scenery
  movingClouds: { mesh: THREE.Group; velocity: THREE.Vector3 }[]
  backgroundMesh?: THREE.Mesh

  // Resources
  birdResource: any
  boxResource: any
  birdDef: SpriteDefinition
  boxDef: SpriteDefinition

  // UI
  parentContainer: GroupRenderable
  titleText: TextRenderable
  instructionsText: TextRenderable
  statusText: TextRenderable
  debugText: TextRenderable

  // Lifecycle
  frameCallback: (deltaTime: number) => Promise<void>
  keyHandler: (key: Buffer) => void
  mouseHandler: (event: MouseEvent) => void
  resizeHandler: (width: number, height: number) => void
  isInitialized: boolean
}

let gameState: GameState | null = null

const materialFactory = () =>
  new MeshLambertNodeMaterial({
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
  })



async function createPhysicsObject(
  state: GameState,
  x: number,
  y: number,
  width: number,
  height: number,
  type: 'bird' | 'box',
  isStatic: boolean = false
): Promise<PhysicsObject | null> {
  if (!state.isInitialized) return null

  const rigidBodyDesc = isStatic
    ? RAPIER.RigidBodyDesc.fixed().setTranslation(x, y)
    : RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y)

  const rigidBody = state.physicsWorld.createRigidBody(rigidBodyDesc)

  const colliderDesc = type === 'bird'
    ? RAPIER.ColliderDesc.ball(Math.min(width, height) * 0.4).setDensity(5.0)
    : RAPIER.ColliderDesc.cuboid(width * 0.4, height * 0.4)


  colliderDesc.setRestitution(0.3).setFriction(0.8)
  state.physicsWorld.createCollider(colliderDesc, rigidBody)

  const id = `${type}_${Date.now()}_${Math.random()}`
  const spriteDef = type === 'bird' ? state.birdDef : state.boxDef

  try {
    const sprite = await state.spriteAnimator.createSprite(
      { ...spriteDef, id },
      materialFactory
    )

    const spriteScale = Math.min(width, height) * 1.2
    sprite.setScale(new THREE.Vector3(spriteScale, spriteScale, spriteScale))
    sprite.setPosition(new THREE.Vector3(x, y, 0))

    const obj: PhysicsObject = {
      rigidBody,
      sprite,
      width,
      height,
      id,
      type,
    }


    state.objects.push(obj)
    return obj
  } catch (error) {
    state.physicsWorld.removeRigidBody(rigidBody)
    console.warn(`Failed to create ${type} sprite: ${error}`)
    return null
  }
}


async function createLevel(state: GameState): Promise<void> {
  // Create a fun castle with towers and connected bridge
  const boxSize = 0.8
  const spacing = boxSize * 1.1
  const startX = 6
  const startY = -10.0 + boxSize / 2

  // Store references to key blocks for connecting later
  const leftTowerBlocks: PhysicsObject[] = []
  const rightTowerBlocks: PhysicsObject[] = []

  // Left tower (tall and narrow - easy to topple)
  for (let i = 0; i < 6; i++) {
    const block = await createPhysicsObject(state, startX, startY + i * spacing, boxSize, boxSize, 'box')
    if (block) leftTowerBlocks.push(block)
  }

  // Right tower (tall and narrow)  
  for (let i = 0; i < 6; i++) {
    const block = await createPhysicsObject(state, startX + 5 * spacing, startY + i * spacing, boxSize, boxSize, 'box')
    if (block) rightTowerBlocks.push(block)
  }

  // Castle gate base (2 blocks wide gap in middle)
  await createPhysicsObject(state, startX + spacing, startY, boxSize, boxSize, 'box')
  await createPhysicsObject(state, startX + 4 * spacing, startY, boxSize, boxSize, 'box')

  // Gate pillars (weak support columns)
  for (let i = 1; i < 4; i++) {
    await createPhysicsObject(state, startX + spacing, startY + i * spacing, boxSize, boxSize, 'box')
    await createPhysicsObject(state, startX + 4 * spacing, startY + i * spacing, boxSize, boxSize, 'box')
  }

  // Bridge across the top - now connected to towers with joints!
  const leftBridge = await createPhysicsObject(state, startX + 2 * spacing, startY + 4 * spacing, boxSize, boxSize, 'box')
  const rightBridge = await createPhysicsObject(state, startX + 3 * spacing, startY + 4 * spacing, boxSize, boxSize, 'box')

  // Connect the two bridge blocks together (solid bridge)
  if (leftBridge && rightBridge) {
    const bridgeJointParams = RAPIER.JointData.fixed(
      { x: spacing * 0.5, y: 0.0 }, 0.0,  // Connection point on left bridge (half spacing to center)
      { x: -spacing * 0.5, y: 0.0 }, 0.0  // Connection point on right bridge (negative half spacing to center)
    )
    state.physicsWorld.createImpulseJoint(bridgeJointParams, leftBridge.rigidBody, rightBridge.rigidBody, true)
  }

  // Connect bridge ends to tower tops (breakable under stress)
  if (leftBridge && leftTowerBlocks[4]) {
    const leftJointParams = RAPIER.JointData.fixed(
      { x: 0.0, y: 0.0 }, 0.0,           // Connection point on tower top
      { x: -spacing * 2, y: 0.0 }, 0.0   // Connection point on bridge (left end)
    )
    state.physicsWorld.createImpulseJoint(leftJointParams, leftTowerBlocks[4].rigidBody, leftBridge.rigidBody, true)
  }

  if (rightBridge && rightTowerBlocks[4]) {
    const rightJointParams = RAPIER.JointData.fixed(
      { x: 0.0, y: 0.0 }, 0.0,           // Connection point on tower top  
      { x: spacing * 2, y: 0.0 }, 0.0    // Connection point on bridge (right end)
    )
    state.physicsWorld.createImpulseJoint(rightJointParams, rightTowerBlocks[4].rigidBody, rightBridge.rigidBody, true)
  }

  // Crown jewel - single box on top of left tower (prime target!)
  await createPhysicsObject(state, startX, startY + 6 * spacing, boxSize, boxSize, 'box')
}

async function resetBird(state: GameState): Promise<void> {
  if (state.bird) {
    state.bird.sprite.destroy()
    state.physicsWorld.removeRigidBody(state.bird.rigidBody)
    const index = state.objects.indexOf(state.bird)
    if (index > -1) state.objects.splice(index, 1)
  }

  // Create new bird at launch position
  const birdSize = 0.6
  const bird = await createPhysicsObject(state, state.birdStartPosition.x, state.birdStartPosition.y, birdSize, birdSize, 'bird')
  if (bird) {
    state.bird = bird
    // Set bird as kinematic initially (not affected by physics until launched)
    bird.rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased)
    // Bird ready
  }
}

function launchBird(state: GameState): void {
  if (!state.bird) return

  // Calculate launch velocity from drag distance
  const birdPos = state.bird.rigidBody.translation()
  const launchCenter = state.birdStartPosition
  const dragVector = new THREE.Vector2(birdPos.x - launchCenter.x, birdPos.y - launchCenter.y)
  const dragDistance = dragVector.length()

  if (dragDistance < 0.1) return // No drag, no launch

  // Convert bird to dynamic body
  state.bird.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic)

  // Apply launch impulse (opposite direction of drag)
  const launchVelocity = dragVector.clone().negate().multiplyScalar(LAUNCH_POWER_MULTIPLIER)
  state.bird.rigidBody.setLinvel({ x: launchVelocity.x, y: launchVelocity.y }, true)

  // Add some spin for realism
  const spin = (Math.random() - 0.5) * 10
  state.bird.rigidBody.setAngvel(spin, true)

  state.statusText.content = "Bird launched! Press [N] for new bird"
}

async function createScenery(state: GameState): Promise<void> {
  const { scene } = state;

  // Create Clouds
  const cloudMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const numClouds = 8; // Total number of clouds

  for (let i = 0; i < numClouds; i++) {
    const cloudGroup = new THREE.Group();
    const numBlobs = 3 + Math.floor(Math.random() * 3); // Each cloud has 3-5 blobs

    for (let j = 0; j < numBlobs; j++) {
      const blobSize = 0.8 + Math.random() * 0.8;
      const blobGeometry = new THREE.SphereGeometry(blobSize, 8, 6);
      const blob = new THREE.Mesh(blobGeometry, cloudMaterial);

      // Make them look less like perfect spheres
      blob.scale.set(1.5, 1.0, 1.0);

      if (j > 0) {
        // Position subsequent blobs relative to the first one
        blob.position.set(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 0.5
        );
      }
      cloudGroup.add(blob);
    }

    const z = -5 - Math.random() * 5; // Range from -5 (near) to -10 (far)
    const y = Math.random() * 4 + 4;
    const x = (Math.random() - 0.5) * 35; // Start at a random horizontal position
    cloudGroup.position.set(x, y, z);

    // Scale the cloud based on its depth for a parallax effect
    const scale = 0.5 + (z - (-10)) / 5 * 0.8; // Scale from 0.5 to 1.3
    cloudGroup.scale.set(scale, scale, scale);

    scene.add(cloudGroup);

    // Speed is also based on depth - closer clouds move faster
    const speed = (0.001 + Math.random() * 0.002) * (scale * 1.2);
    state.movingClouds.push({
      mesh: cloudGroup,
      velocity: new THREE.Vector3(speed, 0, 0),
    });
  }


  // Create Trees
  const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 }); // SaddleBrown
  const leavesMaterial = new THREE.MeshPhongMaterial({ color: 0x2E8B57 }); // SeaGreen

  for (let i = 0; i < 5; i++) {
    const tree = new THREE.Group();
    const trunkHeight = 1.5 + Math.random() * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, trunkHeight, 8), trunkMaterial);

    const leavesHeight = 2.5 + Math.random();
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.2, leavesHeight, 8), leavesMaterial);
    leaves.position.y = trunkHeight / 2 + leavesHeight / 2.5; // Position leaves on top of the trunk

    tree.add(trunk, leaves);

    // Position trees on the ground level, to the sides
    const side = i < 2 ? -1 : 1;
    const x = side * (10 + Math.random() * 4);
    const y = -10.5 + trunkHeight / 2; // Place base of the trunk on the ground
    tree.position.set(x, y, -3);
    tree.scale.set(0.7, 0.7, 0.7);
    scene.add(tree);
  }
}

async function resetLevel(state: GameState): Promise<void> {
  // Remove all objects
  for (const obj of state.objects) {
    obj.sprite.destroy()
    state.physicsWorld.removeRigidBody(obj.rigidBody)
  }
  state.objects = []
  state.bird = null

  // Recreate level
  await createLevel(state)
  await resetBird(state)

  state.statusText.content = "Level reset! Ready to launch!"
}

function updatePhysics(state: GameState, deltaTime: number): void {
  if (!state.isInitialized) return

  state.physicsWorld.step()

  // Update sprite positions from physics bodies
  for (const obj of state.objects) {
    const position = obj.rigidBody.translation()
    const rotation = obj.rigidBody.rotation()

    obj.sprite.setPosition(new THREE.Vector3(position.x, position.y, 0))
    obj.sprite.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation))
  }

  // Remove objects that have fallen off screen
  state.objects = state.objects.filter((obj) => {
    const pos = obj.rigidBody.translation()
    if (pos.y < -17.5 || Math.abs(pos.x) > 20) {
      obj.sprite.destroy()
      state.physicsWorld.removeRigidBody(obj.rigidBody)
      if (obj === state.bird) {
        state.bird = null
        // Auto-reset bird after a delay
        setTimeout(() => resetBird(state).catch(console.error), 2000)
      }
      return false
    }
    return true
  })
}

function screenToWorld(state: GameState, screenX: number, screenY: number): THREE.Vector2 {
  // Convert terminal coordinates to world coordinates
  const terminalWidth = state.engine.cliRenderer.terminalWidth
  const terminalHeight = state.engine.cliRenderer.terminalHeight

  // Calculate world bounds
  const worldWidth = WORLD_HEIGHT * state.engine.aspectRatio

  // Map screen to world coordinates
  const worldX = (screenX / terminalWidth) * worldWidth - (worldWidth / 2)
  const worldY = WORLD_HEIGHT / 2 - (screenY / terminalHeight) * WORLD_HEIGHT

  return new THREE.Vector2(worldX, worldY)
}

export async function run(renderer: CliRenderer): Promise<void> {
  renderer.start()
  const initialTermWidth = renderer.terminalWidth
  const initialTermHeight = renderer.terminalHeight

  const parentContainer = new GroupRenderable("angry-birds-container", {
    x: 0, y: 0, zIndex: 15, visible: true
  })
  renderer.add(parentContainer)

  const { frameBuffer } = renderer.createFrameBuffer("angry-birds-main", {
    width: initialTermWidth,
    height: initialTermHeight,
    x: 0, y: 0, zIndex: 10
  })

  const engine = new ThreeCliRenderer(renderer, {
    width: initialTermWidth,
    height: initialTermHeight,
    focalLength: 1,
    backgroundColor: RGBA.fromValues(0.53, 0.81, 0.98, 1.0) // Light blue sky
  })

  await engine.init()

  const scene = new THREE.Scene()
  const worldWidth = WORLD_HEIGHT * engine.aspectRatio
  const camera = new THREE.OrthographicCamera(
    worldWidth / -2, worldWidth / 2,
    WORLD_HEIGHT / 2, WORLD_HEIGHT / -2,
    0.1, 1000
  )
  camera.position.set(0, -0.5, 5)
  camera.lookAt(0, -0.5, 0)
  scene.add(camera)

  engine.setActiveCamera(camera)
  await Bun.write("engine-debug.log", `Camera setup complete. World width: ${worldWidth}, Camera bounds: ${camera.left} to ${camera.right}\n`, { append: true })

  // Camera setup complete

  const resourceManager = new SpriteResourceManager(scene)
  const spriteAnimator = new SpriteAnimator(scene)

  // Initialize physics
  await RAPIER.init()
  const world = new RAPIER.World(GRAVITY)

  // Create ground
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(15.0, 0.5)
  const ground = world.createCollider(groundColliderDesc)
  ground.setTranslation({ x: 0.0, y: -10.5 })

  // Create walls
  const leftWallDesc = RAPIER.ColliderDesc.cuboid(0.5, 15.0)
  const leftWall = world.createCollider(leftWallDesc)
  leftWall.setTranslation({ x: -15.0, y: -2.5 })



  // Debug asset paths
  const debugLog = `Asset paths: ${JSON.stringify({ birdPath, cratePath, backgroundPath }, null, 2)}\n`
  await Bun.write("engine-engine-debug.log", debugLog)

  // Create sprite resources using actual image assets
  let birdResource, boxResource, backgroundResource
  try {
    birdResource = await resourceManager.createResource({
      imagePath: birdPath,
      sheetNumFrames: 1
    })
    await Bun.write("engine-engine-debug.log", `Bird resource created successfully\n`, { append: true })
  } catch (error) {
    await Bun.write("engine-engine-debug.log", `Bird resource error: ${error}\n`, { append: true })
    throw error
  }

  try {
    boxResource = await resourceManager.createResource({
      imagePath: cratePath,
      sheetNumFrames: 1
    })
    await Bun.write("engine-debug.log", debugLog + `Box resource created successfully\n`, { append: true })
  } catch (error) {
    await Bun.write("engine-debug.log", debugLog + `Box resource error: ${error}\n`, { append: true })
    throw error
  }

  try {
    backgroundResource = await resourceManager.createResource({
      imagePath: backgroundPath,
      sheetNumFrames: 1
    })
    await Bun.write("engine-debug.log", debugLog + `Background resource created successfully\n`, { append: true })
  } catch (error) {
    await Bun.write("engine-debug.log", debugLog + `Background resource error: ${error}\n`, { append: true })
    throw error
  }

  const birdDef: SpriteDefinition = {
    initialAnimation: "idle",
    animations: { idle: { resource: birdResource, frameDuration: 1000 } },
    scale: 1.0
  }

  const boxDef: SpriteDefinition = {
    initialAnimation: "idle",
    animations: { idle: { resource: boxResource, frameDuration: 1000 } },
    scale: 1.0
  }




  // Setup lighting for a cleaner look
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5) // A bit of ambient light
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 3.5) // Main light source
  directionalLight.position.set(-10, 10, 10) // From top-left
  scene.add(directionalLight)

  // Add a visible ground mesh for reference
  const groundGeometry = new THREE.BoxGeometry(30, 0.4, 0.2)
  const groundMaterial = new THREE.MeshPhongMaterial({
    color: 0x228B22, // ForestGreen
    transparent: true,
    opacity: 0.8,
  })
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial)
  groundMesh.position.set(0, -10.5, -0.5)
  scene.add(groundMesh)

  // Create UI elements
  const titleText = new TextRenderable("angry-birds-title", {
    content: "Angry Birds Clone - Drag bird to aim and launch!",
    x: 1, y: 1, fg: "#FFFF00", zIndex: 20
  })
  parentContainer.add(titleText)

  const instructionsText = new TextRenderable("angry-birds-instructions", {
    content: "Mouse: Drag bird to aim and release to launch | Keys: [R] reset, [N] new bird, [Escape] menu",
    x: 1, y: 2, fg: "#FFFFFF", zIndex: 20
  })
  parentContainer.add(instructionsText)

  const statusText = new TextRenderable("angry-birds-status", {
    content: "Ready to launch!",
    x: 1, y: 3, fg: "#CCCCCC", zIndex: 20
  })
  parentContainer.add(statusText)

  const debugText = new TextRenderable("angry-birds-debug", {
    content: "Debug: Mouse coords will appear here",
    x: 1, y: 4, fg: "#FFFF00", zIndex: 20
  })
  parentContainer.add(debugText)


  const state: GameState = {
    engine, scene, camera, resourceManager, spriteAnimator,
    physicsWorld: world, ground, objects: [],
    bird: null, birdStartPosition: new THREE.Vector3(-8, -8.5, 0),
    isDragging: false, dragOffset: new THREE.Vector2(),
    launchDirection: new THREE.Vector2(),
    movingClouds: [],
    birdResource, boxResource, birdDef, boxDef,
    parentContainer, titleText, instructionsText, statusText, debugText,
    frameCallback: async () => { }, keyHandler: () => { },
    mouseHandler: () => { }, resizeHandler: () => { },
    isInitialized: true
  }

  // Setup lighting for a cleaner look
  // Create background mesh
  const backgroundGeometry = new THREE.PlaneGeometry(1, 1) // Will be scaled later
  const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: backgroundResource.texture,
    transparent: true,
    depthWrite: false,
  })
  const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial)
  backgroundMesh.position.set(0, -1, -9) // Behind everything
  scene.add(backgroundMesh)
  
  // Add backgroundMesh to state
  state.backgroundMesh = backgroundMesh



  // Scale background to cover the screen
  const scaleBackground = (width: number, height: number) => {
    const worldWidth = state.camera.right - state.camera.left
    const worldHeight = state.camera.top - state.camera.bottom

    state.backgroundMesh!.scale.set(worldWidth, worldHeight, 1)
  }

  // Set initial background scale
  scaleBackground(initialTermWidth, initialTermHeight)

  // Mouse event handling
  state.mouseHandler = (event: MouseEvent) => {
    const worldPos = screenToWorld(state, event.x, event.y)
    const birdPos = state.bird ? state.bird.rigidBody.translation() : { x: 0, y: 0 }
    const distanceToBird = state.bird ? Math.sqrt(Math.pow(worldPos.x - birdPos.x, 2) + Math.pow(worldPos.y - birdPos.y, 2)) : 999

    // Update debug display
    state.debugText.content = `Mouse: ${event.type} screen(${event.x},${event.y}) world(${worldPos.x.toFixed(2)},${worldPos.y.toFixed(2)}) | Bird: (${birdPos.x.toFixed(2)},${birdPos.y.toFixed(2)}) dist:${distanceToBird.toFixed(2)} dragging:${state.isDragging}`

    if (!state.bird || event.defaultPrevented) return

    switch (event.type) {
      case 'down':
        // Check if clicking near the bird (use the distance we already calculated)
        if (distanceToBird < 1.5) {
          state.isDragging = true
          state.dragOffset.set(worldPos.x - birdPos.x, worldPos.y - birdPos.y)
          state.statusText.content = "Aiming... Release to launch!"
          event.preventDefault()
        }
        break

      case 'move':
      case 'drag':
        if (state.isDragging && state.bird) {
          const targetPos = new THREE.Vector2(
            worldPos.x - state.dragOffset.x,
            worldPos.y - state.dragOffset.y
          )

          // Constrain drag distance
          const launchCenter = state.birdStartPosition
          const dragVector = targetPos.clone().sub(new THREE.Vector2(launchCenter.x, launchCenter.y))
          const dragDistance = dragVector.length()

          if (dragDistance > MAX_LAUNCH_DISTANCE) {
            dragVector.normalize().multiplyScalar(MAX_LAUNCH_DISTANCE)
            targetPos.copy(new THREE.Vector2(launchCenter.x, launchCenter.y).add(dragVector))
          }

          // Update bird position
          state.bird.rigidBody.setTranslation({ x: targetPos.x, y: targetPos.y }, true)
          state.bird.sprite.setPosition(new THREE.Vector3(targetPos.x, targetPos.y, 0))

          // Calculate launch direction (opposite of drag)
          state.launchDirection.copy(dragVector).negate().normalize()
          const power = Math.min(dragDistance / MAX_LAUNCH_DISTANCE, 1.0)
          state.statusText.content = `Power: ${Math.round(power * 100)}%`

          event.preventDefault()
        }
        break

      case 'up':
        if (state.isDragging && state.bird) {
          launchBird(state)
          state.isDragging = false
          event.preventDefault()
        }
        break
    }
  }

  // Key handling
  state.keyHandler = (key: Buffer) => {
    const keyStr = key.toString()

    switch (keyStr) {
      case 'r':
        resetLevel(state).catch(console.error)
        break

      case 'n':
        resetBird(state).catch(console.error)
        break
    }
  }

  // Frame callback
  state.frameCallback = async (deltaTime: number) => {
    // Move clouds
    const worldWidth = state.camera.right - state.camera.left;
    for (const cloud of state.movingClouds) {
      cloud.mesh.position.x += cloud.velocity.x * deltaTime;

      // When a cloud goes off-screen, reset its properties for variety
      if (cloud.mesh.position.x > worldWidth / 2 + 5) {
        cloud.mesh.position.x = -worldWidth / 2 - 5;

        // Respawn with new random properties
        const z = -5 - Math.random() * 5;
        cloud.mesh.position.y = Math.random() * 4 + 4;
        cloud.mesh.position.z = z;

        const scale = 0.5 + (z - (-10)) / 5 * 0.8;
        cloud.mesh.scale.set(scale, scale, scale);

        const speed = (0.001 + Math.random() * 0.002) * (scale * 1.2);
        cloud.velocity.x = speed;
      }
    }

    updatePhysics(state, deltaTime);
    state.spriteAnimator.update(deltaTime)
    
    // No shader uniforms to update with basic materials
    // (We'll add this back when we implement proper shaders later)
    
    // Debug frame rendering
    const frameStart = Date.now()
    await state.engine.drawScene(state.scene, frameBuffer, deltaTime)
    const frameTime = Date.now() - frameStart
    
    // Log occasionally to avoid spam
    if (Math.random() < 0.01) { // ~1% of frames
      await Bun.write("engine-debug.log", `Frame rendered in ${frameTime}ms. Scene children: ${state.scene.children.length}\n`, { append: true })
    }

    // Update UI
    const boxCount = state.objects.filter(obj => obj.type === 'box').length
    const birdStatus = state.bird ? (state.isDragging ? "Aiming" : "Ready") : "Respawning..."
    state.statusText.content = `Boxes: ${boxCount} | Bird: ${birdStatus} | Camera: ${state.camera.left.toFixed(1)} to ${state.camera.right.toFixed(1)}`

    // Update debug info if no recent mouse event
    if (!state.debugText.content.includes("Mouse:")) {
      const birdPos = state.bird ? state.bird.rigidBody.translation() : { x: 0, y: 0 }
      state.debugText.content = `World bounds: ${state.camera.left.toFixed(1)} to ${state.camera.right.toFixed(1)} x ${state.camera.bottom.toFixed(1)} to ${state.camera.top.toFixed(1)} | Bird: (${birdPos.x.toFixed(2)},${birdPos.y.toFixed(2)})`
    }
  }

  // Resize handler
  state.resizeHandler = (newWidth: number, newHeight: number) => {
    frameBuffer.resize(newWidth, newHeight)
    scaleBackground(newWidth, newHeight)
  }

  state.resizeHandler(initialTermWidth, initialTermHeight)

  // Register event handlers
  renderer.setFrameCallback(state.frameCallback)
  process.stdin.on("data", state.keyHandler)
  renderer.on("resize", state.resizeHandler)

  // Create mouse event handler renderable to capture mouse events
  const mouseCapture = new class extends Renderable {
    constructor() {
      super("mouse-capture", {
        x: 0, y: 0,
        width: renderer.terminalWidth,
        height: renderer.terminalHeight,
        zIndex: 1000, // High z-index to capture all events
        visible: true
      })
    }

    protected renderSelf(): void {
      // Invisible - just captures mouse events
    }

    processMouseEvent(event: MouseEvent): void {
      state.mouseHandler(event)
    }
  }
  parentContainer.add(mouseCapture)

  // Create initial level and bird
  await createScenery(state);
  await Bun.write("engine-debug.log", `Scenery created. Scene children count: ${scene.children.length}\n`, { append: true })
  
  await createLevel(state);
  await Bun.write("engine-debug.log", `Level created. Objects count: ${state.objects.length}\n`, { append: true })
  
  await resetBird(state)
  await Bun.write("engine-debug.log", `Bird created. Bird exists: ${!!state.bird}\n`, { append: true })

  // Debug scene contents
  const sceneDebug = scene.children.map(child => `${child.type}:${child.name || 'unnamed'}`).join(', ')
  await Bun.write("engine-debug.log", `Final scene children: ${sceneDebug}\n`, { append: true })

  gameState = state
}

export function destroy(renderer: CliRenderer): void {
  if (!gameState) return

  renderer.removeFrameCallback(gameState.frameCallback)
  process.stdin.removeListener("data", gameState.keyHandler)
  renderer.removeListener("resize", gameState.resizeHandler)

  for (const obj of gameState.objects) {
    gameState.physicsWorld.removeRigidBody(obj.rigidBody)
  }

  gameState.engine.destroy()
  renderer.remove("angry-birds-main")
  renderer.remove("angry-birds-container")

  gameState = null
}

if (import.meta.main) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 60,
    enableMouseMovement: true
  })
  await run(renderer)
}
