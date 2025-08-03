# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Angry Birds-style physics game built with TypeScript and the OpenTUI terminal rendering framework. The project demonstrates advanced terminal graphics capabilities including:

- Real-time 3D rendering with WebGPU in terminal
- 2D physics simulation using Rapier2D
- Sprite animation and particle systems
- Mouse interaction and input handling
- Terminal-based UI components

## Development Commands

### Running the Application
```bash
bun run index.ts
```

### Dependencies Management
```bash
bun install        # Install dependencies
```

### Physics and Rendering
The game uses Bun as the runtime and includes several physics and rendering libraries:
- `@dimforge/rapier2d-simd-compat` for 2D physics
- `three` for 3D graphics primitives
- `planck` as alternative physics engine
- `yoga-layout` for flexbox-style layouts

## Documentation

The comprehensive OpenTUI API documentation is available in `API.md`. Key areas include:

- **Core Rendering System**: `CliRenderer` for terminal management, `Renderable` base class hierarchy
- **3D Engine**: `ThreeCliRenderer` with WebGPU integration, sprite system with `SpriteAnimator` and `SpriteResourceManager`
- **UI Components**: `SelectElement`, `InputElement`, and flexbox-style layout system
- **Animation**: Timeline-based keyframe animation with easing functions
- **Physics Integration**: Rapier2D and Planck physics adapters with explosion systems
- **Input Handling**: Mouse events with coordinate transformation and keyboard input parsing
- **Post-Processing**: Visual effects filters (scanlines, vignette, blur, etc.)

## Architecture Overview

### Core Framework (`opentui-src/`)
The OpenTUI framework provides terminal-based rendering capabilities:

- **Rendering System**: `CliRenderer` class manages terminal output, frame buffers, and render loops
- **3D Engine**: `ThreeCliRenderer` integrates Three.js with WebGPU for 3D graphics in terminal
- **UI Components**: Input elements, select components, layout system with yoga-layout
- **Animation**: Timeline-based animation system with easing functions
- **Physics Integration**: Adapters for both Rapier and Planck physics engines

### Game Implementation (`index.ts`)
Main game logic implements:

- **Physics Objects**: Dynamic rigid bodies for birds and boxes using Rapier2D
- **Sprite System**: Animated sprites with texture management and resource loading
- **Input Handling**: Mouse drag-to-aim mechanics and keyboard controls
- **Scene Management**: 3D scene with lighting, background, moving clouds, and ground
- **Game State**: Centralized state management for physics world, objects, and UI

### Key Architectural Patterns

1. **Renderable Tree**: All visual elements extend `Renderable` base class and form a hierarchical tree
2. **Frame Buffers**: Optimized rendering to separate buffers for performance
3. **Event System**: Mouse and keyboard events bubble through renderable hierarchy
4. **Resource Management**: Centralized sprite and texture resource loading
5. **Physics Integration**: Seamless sync between physics simulation and visual representation

### Asset Pipeline
Assets are imported using Bun's asset importing with type annotations:
```typescript
import cratePath from "./assets/crate.png" with { type: "image/png" }
```

### Performance Considerations
- Uses native Zig rendering backend for terminal output optimization
- Optional threading support (disabled on Linux due to stdlib issues)
- Frame rate targeting with configurable FPS limits
- Memory usage tracking and optimization
- Hit testing grid for efficient mouse interaction

## Development Notes

- Game state is managed through a single `GameState` interface
- Physics world updates are synchronized with sprite positions each frame
- Mouse coordinates are converted from screen space to world coordinates
- Debug logging is written to `engine-debug.log` and `engine-engine-debug.log`
- The project uses ES modules and targets modern JavaScript features