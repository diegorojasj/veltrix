import { onCleanup, onMount } from 'solid-js'
import { createVeltrixScene } from '../three/scene'
import './AISphere.css'

interface AISphereProps {
  onSphereClick?: () => void
}

function AISphere(props: AISphereProps) {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const scene = createVeltrixScene(canvas, {
      onSphereClick: () => props.onSphereClick?.(),
    })
    onCleanup(() => scene.dispose())
  })

  return <canvas ref={canvas} class="ai-sphere" aria-hidden="true" tabIndex={-1} />
}

export default AISphere
