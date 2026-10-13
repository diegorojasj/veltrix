import { createSignal } from 'solid-js'
import './App.css'
import AISphere from './components/AISphere'

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <>
      <AISphere onSphereClick={() => setCount((count) => count + 1)} />
      <section id="center">
        <div>
          <h1>VELTRIX</h1>
          <p id='description' >
            A bold, futuristic digital experience exploring the intersection of technology, 3D graphics, and creative innovation
          </p>
        </div>
        <p class="counter" aria-live="polite">
          Click the sphere — {count()} {count() === 1 ? 'node' : 'nodes'} added
        </p>
      </section>

      <div class="ticks"></div>

      <div class="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
