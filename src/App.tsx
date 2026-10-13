import { createSignal } from 'solid-js'
import './App.css'
import './three/scene'

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <>
      <section id="center">
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          class="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count()}
        </button>
      </section>

      <div class="ticks"></div>

      <div class="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
