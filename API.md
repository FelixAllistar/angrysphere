# OpenTUI API Documentation

This comprehensive API documentation covers all major features and classes in OpenTUI, based on the working examples in the codebase.

## Table of Contents

1. [Core Rendering System](#core-rendering-system)
2. [UI Components](#ui-components)
3. [Layout System](#layout-system)
4. [Styled Text System](#styled-text-system)
5. [3D Rendering](#3d-rendering)
6. [Animation System](#animation-system)
7. [Physics Integration](#physics-integration)
8. [Input Handling](#input-handling)
9. [Examples](#examples)

---

## Core Rendering System

### CliRenderer

The main rendering engine that manages the terminal interface.

```typescript
import { createCliRenderer, CliRenderer } from "@opentui/core"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 60,
  useThread: true,
  gatherStats: true,
  enableMouseMovement: true
})
```

#### Configuration Options
- `exitOnCtrlC?: boolean` - Exit on Ctrl+C (default: true)
- `targetFps?: number` - Target frame rate (default: 30)
- `useThread?: boolean` - Use threading for rendering (default: true, disabled on Linux)
- `gatherStats?: boolean` - Collect performance statistics
- `enableMouseMovement?: boolean` - Enable mouse movement tracking
- `resolution?: PixelResolution` - Terminal pixel resolution
- `postProcessFns?: Function[]` - Post-processing effects

#### Key Methods
```typescript
// Lifecycle
renderer.start()                    // Start render loop
renderer.pause()                    // Pause rendering
renderer.stop()                     // Stop and cleanup
renderer.renderOnce()               // Render single frame

// Content management
renderer.add(renderable)            // Add renderable object
renderer.remove(id)                 // Remove by ID
renderer.setBackgroundColor("#001122")

// Frame buffers and text
renderer.createFrameBuffer(id, options)
renderer.createStyledText(id, options)

// Frame callbacks
renderer.setFrameCallback(async (deltaTime) => {
  // Animation logic
})

// Post-processing effects
renderer.addPostProcessFn(effectFn)
renderer.clearPostProcessFns()
```

#### Events
```typescript
renderer.on("resize", (width, height) => {})
renderer.on("key", (data) => {})
```

### Renderable Base Class

All drawable objects extend `Renderable`.

```typescript
class MyRenderable extends Renderable {
  protected renderSelf(buffer: OptimizedBuffer): void {
    buffer.drawText("Content", this.x, this.y, RGBA.white)
  }
}

const obj = new MyRenderable("my-id", {
  x: 10, y: 5, zIndex: 1,
  width: 20, height: 10,
  visible: true
})
```

#### Common Properties
- `x, y`: Position coordinates
- `width, height`: Dimensions
- `zIndex`: Rendering order
- `visible`: Visibility flag

#### Built-in Renderables
- `TextRenderable`: Basic text display
- `BoxRenderable`: Styled boxes with borders
- `GroupRenderable`: Container for other renderables
- `FrameBufferRenderable`: Optimized buffer rendering

---

## UI Components

### SelectElement

Interactive dropdown/list selection component.

```typescript
import { SelectElement, SelectElementEvents } from "@opentui/core"

const selectElement = new SelectElement("my-select", {
  x: 5, y: 2, width: 50, height: 20,
  options: [
    { name: "Option 1", description: "First option", value: "opt1" },
    { name: "Option 2", description: "Second option", value: "opt2" }
  ],
  backgroundColor: "#001122",
  selectedBackgroundColor: "#334455",
  textColor: "#FFFFFF",
  selectedTextColor: "#FFFF00",
  borderStyle: "single",
  borderColor: "#FFFFFF",
  focusedBorderColor: "#00AAFF",
  showDescription: true,
  showScrollIndicator: true,
  wrapSelection: false,
  fastScrollStep: 5,
  title: "Select an Option"
})

// Event handling
selectElement.on(SelectElementEvents.ITEM_SELECTED, (index, option) => {
  console.log(`Selected: ${option.name}`)
})

selectElement.on(SelectElementEvents.SELECTION_CHANGED, (index, option) => {
  console.log(`Navigated to: ${option.name}`)
})

// Methods
selectElement.focus()
selectElement.blur()
selectElement.setShowDescription(false)
selectElement.setWrapSelection(true)
```

#### SelectElement Configuration
- `options: SelectOption[]` - Array of selectable items
- `backgroundColor/selectedBackgroundColor` - Background colors
- `textColor/selectedTextColor` - Text colors
- `borderStyle: BorderStyle` - Border style ("single", "double", "rounded", "heavy")
- `showDescription: boolean` - Show option descriptions
- `showScrollIndicator: boolean` - Show scroll indicator
- `wrapSelection: boolean` - Wrap around at ends
- `fastScrollStep: number` - Fast scroll step size

### InputElement

Text input component with validation support.

```typescript
import { InputElement, InputElementEvents } from "@opentui/core"

const input = new InputElement("my-input", {
  x: 5, y: 2, width: 40, height: 3,
  placeholder: "Enter text...",
  placeholderColor: "#666666",
  textColor: "#FFFFFF",
  backgroundColor: "#001122",
  borderStyle: "single",
  borderColor: "#666666",
  focusedBorderColor: "#00AAFF",
  cursorColor: "#FFFF00",
  value: "",
  maxLength: 100,
  title: "Input Field"
})

// Event handling
input.on(InputElementEvents.INPUT, (value) => {
  console.log(`Input: ${value}`)
})

input.on(InputElementEvents.CHANGE, (value) => {
  console.log(`Changed: ${value}`)
})

input.on(InputElementEvents.ENTER, (value) => {
  console.log(`Submitted: ${value}`)
})

// Methods
input.focus()
input.blur()
input.setValue("new value")
input.getValue()
```

---

## Layout System

OpenTUI provides a flexible layout system using yoga-layout for flexbox-like behavior.

### Layout Container

```typescript
import { Layout, ContainerElement, BufferedElement, FlexDirection, Align, Justify } from "@opentui/core"

const mainLayout = new Layout("main-layout", {
  x: 0, y: 0, zIndex: 1,
  width: renderer.terminalWidth,
  height: renderer.terminalHeight
})

const container = new ContainerElement("container", {
  flexDirection: FlexDirection.Row,
  flexGrow: 1,
  flexShrink: 1
})

// Configure layout
container.setFlexDirection(FlexDirection.Column)
container.setAlignment(Align.Stretch, Justify.Center)
```

### Custom Layout Elements

```typescript
class TextElement extends BufferedElement {
  private text: string = ""

  constructor(id: string, text: string, options: any) {
    super(id, options)
    this.text = text
  }

  protected refreshContent(contentX: number, contentY: number, contentWidth: number, contentHeight: number): void {
    if (!this.frameBuffer) return
    
    const textX = Math.floor((contentWidth - this.text.length) / 2)
    const textY = Math.floor(contentHeight / 2)
    
    this.frameBuffer.drawText(this.text, contentX + textX, contentY + textY, this.textColor, this.backgroundColor)
  }
}
```

### Layout Configuration Methods
```typescript
element.setFlexBasis(100)           // Fixed size
element.setFlex(1, 1)               // Grow/shrink
element.setWidth("auto")            // Width/height
element.setMinWidth(50)             // Constraints
element.setMaxWidth(200)
element.setPosition({ left: 10, top: 5 })  // Absolute positioning
```

---

## Styled Text System

Template literal-based styled text with colors and formatting.

```typescript
import { t, bold, underline, red, green, blue, fg, bgYellow } from "@opentui/core"

// Template literal usage
const styledText = t`${bold(red("ERROR:"))} Connection failed
${bold(green("SUCCESS:"))} Data loaded
${bold(fg("#FFA500")("WARNING:"))} Low memory
${bgYellow(fg("black")(" NOTICE "))} System update`

const styledDisplay = renderer.createStyledText("styled-text", {
  fragment: styledText,
  width: 50,
  height: 6,
  x: 2, y: 8,
  zIndex: 1,
  defaultFg: "#CCCCCC"
})

// Dynamic updates
styledDisplay.fragment = t`${bold("Updated:")} ${blue(newValue)}`
```

### Style Functions
- `bold(text)` - Bold text
- `underline(text)` - Underlined text
- `red(text)`, `green(text)`, `blue(text)` - Color shortcuts
- `fg(color)(text)` - Foreground color (hex or named)
- `bg(color)(text)` - Background color
- `bgYellow(text)` - Background color shortcuts

---

## 3D Rendering

### ThreeCliRenderer

WebGPU-based 3D rendering engine using Three.js.

```typescript
import { ThreeCliRenderer, RGBA } from "@opentui/core"
import * as THREE from "three"

const engine = new ThreeCliRenderer(renderer, {
  width: terminalWidth,
  height: terminalHeight,
  focalLength: 8,
  backgroundColor: RGBA.fromInts(0, 0, 0, 0),
  alpha: true
})
await engine.init()

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, engine.aspectRatio, 1.0, 100.0)
engine.setActiveCamera(camera)

// Render to frame buffer
await engine.drawScene(scene, framebuffer, deltaTime)
```

### Sprite System

```typescript
import { SpriteAnimator, SpriteResourceManager } from "@opentui/core"

const resourceManager = new SpriteResourceManager(scene)
const spriteAnimator = new SpriteAnimator(scene)

// Create sprite resource
const resource = await resourceManager.createResource({
  imagePath: "./assets/sprite.png",
  sheetNumFrames: 8
})

// Define sprite animations
const spriteDef = {
  initialAnimation: "idle",
  animations: {
    idle: {
      resource: resource,
      frameDuration: 150
    }
  },
  scale: 8.0
}

// Create animated sprite
const sprite = await spriteAnimator.createSprite(spriteDef)
sprite.setPosition(new THREE.Vector3(0, 0, 0))
```

### Post-Processing Effects

```typescript
import * as Filters from "@opentui/core/post/filters"

// Apply filters
renderer.addPostProcessFn((buffer, deltaTime) => {
  Filters.applyScanlines(buffer, 0.85)
})

renderer.addPostProcessFn((buffer, deltaTime) => {
  Filters.applyVignette(buffer, 1.2)
})

// Available filters
Filters.applyGrayscale(buffer)
Filters.applySepia(buffer)
Filters.applyInvert(buffer)
Filters.applyNoise(buffer, 0.05)
Filters.applyBlur(buffer, 2)
Filters.applyChromaticAberration(buffer, 2)
Filters.applyAsciiArt(buffer)
```

---

## Animation System

### Timeline

Keyframe-based animation system with easing and callbacks.

```typescript
import { createTimeline, Timeline } from "@opentui/core"

const timeline = createTimeline({
  duration: 5000,
  loop: true,
  autoplay: true
})

// Animate object properties
const obj = { x: 0, y: 0, scale: 1.0 }

timeline.add(obj, {
  x: 100,
  y: 50,
  duration: 2000,
  ease: "inOutQuad",
  onUpdate: (animation) => {
    const { x, y } = animation.targets[0]
    renderable.x = x
    renderable.y = y
  }
}, 0) // Start at 0ms

// Nested timelines
const subTimeline = createTimeline({ duration: 3000 })
timeline.sync(subTimeline, 1000) // Start sub-timeline at 1000ms

// Callbacks
timeline.call(() => {
  console.log("Animation checkpoint reached")
}, 2500)

// Control playback
timeline.play()
timeline.pause()
timeline.restart()
```

### Animation Options
- `duration: number` - Animation duration in ms
- `ease: string` - Easing function ("linear", "inOutQuad", "inOutSine", etc.)
- `loop: number` - Loop count (true for infinite)
- `alternate: boolean` - Reverse on alternate loops
- `loopDelay: number` - Delay between loops
- `onUpdate: Function` - Update callback
- `onComplete: Function` - Completion callback

---

## Physics Integration

### Rapier Physics

2D physics simulation with Rapier.js integration.

```typescript
import { RapierPhysicsWorld, PhysicsExplosionManager } from "@opentui/core"
import RAPIER from "@dimforge/rapier2d-simd-compat"

// Initialize physics
await RAPIER.init()
const world = new RAPIER.World({ x: 0.0, y: -9.81 })

// Create physics bodies
const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(x, y)
const rigidBody = world.createRigidBody(rigidBodyDesc)

const colliderDesc = RAPIER.ColliderDesc.cuboid(width * 0.5, height * 0.5)
world.createCollider(colliderDesc, rigidBody)

// Physics explosion system
const explosionManager = new PhysicsExplosionManager(scene, 
  RapierPhysicsWorld.createFromRapierWorld(world))

const explosionHandle = await explosionManager.createExplosionForSprite(sprite, {
  numRows: 4,
  numCols: 4,
  explosionForce: 2.0,
  durationMs: 3000,
  fadeOut: false
})

// Update physics
function updatePhysics(deltaTime: number) {
  world.step()
  
  // Sync physics bodies with sprites
  for (const physicsObject of physicsObjects) {
    const position = physicsObject.rigidBody.translation()
    const rotation = physicsObject.rigidBody.rotation()
    
    physicsObject.sprite.setPosition(new THREE.Vector3(position.x, position.y, 0))
    physicsObject.sprite.setRotation(new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation))
  }
}
```

---

## Input Handling

### Keyboard Input

```typescript
import { getKeyHandler, type ParsedKey } from "@opentui/core"

getKeyHandler().on("keypress", (key: ParsedKey) => {
  console.log("Key pressed:", key.name, key.raw)
  
  if (key.ctrl && key.name === "c") {
    // Handle Ctrl+C
  }
  
  if (key.shift && key.name === "tab") {
    // Handle Shift+Tab
  }
  
  switch (key.name) {
    case "up":
    case "down":
    case "enter":
    case "escape":
      // Handle special keys
      break
  }
})
```

### Mouse Events

```typescript
import { MouseEvent, MouseButton } from "@opentui/core"

class InteractiveRenderable extends Renderable {
  processMouseEvent(event: MouseEvent): void {
    switch (event.type) {
      case "click":
        if (event.button === MouseButton.LEFT) {
          console.log("Left clicked")
        }
        break
        
      case "drag":
        console.log("Dragging", event.x, event.y)
        break
        
      case "over":
        console.log("Mouse over")
        break
        
      case "out":
        console.log("Mouse out")
        break
        
      case "drop":
        console.log("Drop from", event.source?.id)
        break
    }
  }
}
```

---

## Examples

### Basic Application Structure

```typescript
import { createCliRenderer, TextRenderable, GroupRenderable } from "@opentui/core"

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 60
  })
  
  renderer.setBackgroundColor("#001122")
  
  // Create container
  const container = new GroupRenderable("main-container", {
    x: 0, y: 0, zIndex: 10, visible: true
  })
  renderer.add(container)
  
  // Add content
  const title = new TextRenderable("title", {
    content: "My OpenTUI App",
    x: 2, y: 1,
    fg: "#FFFFFF",
    zIndex: 1
  })
  container.add(title)
  
  // Start rendering
  renderer.start()
  
  // Handle cleanup
  process.on("exit", () => {
    renderer.stop()
  })
}

main().catch(console.error)
```

This documentation covers the core functionality demonstrated in the OpenTUI examples. Each system is designed to work together, allowing you to build complex terminal applications with 2D/3D graphics, animations, physics, and rich UI components.