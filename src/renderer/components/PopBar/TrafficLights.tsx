type TrafficLightsProps = Record<string, never>

/**
 * Purely decorative window chrome.
 *
 * These no longer drive any window behaviour — the earlier minimise / shrink-to-dot
 * bindings have been removed, so the three dots are inert by design. They keep their
 * familiar macOS-style colours purely as a visual affordance.
 */
const TrafficLights = () => (
  <div className="flex items-center gap-2" aria-hidden="true">
    <span className="traffic-light traffic-light-close" />
    <span className="traffic-light traffic-light-minimize" />
    <span className="traffic-light traffic-light-neutral" />
  </div>
)

export default TrafficLights
