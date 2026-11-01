// daoUI presentation adapter. Exact retains the route, focus, Escape, backdrop
// and history behavior; this supplies content-sized sheet/card geometry. UIKit
// gets its real grabber through navigationGrabber, never a drawn replacement.
const mounted = new WeakMap();
let stylesheet;
const styles = `
#exact-root [data-hatch="dao-panel"][navigationPresentation="modal"] {
  inset: auto 0 0 !important; margin: 0 !important;
  width: 100% !important; height: auto !important;
  max-height: calc(100dvh - 32px) !important;
  border-radius: 24px 24px 0 0 !important; overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
#exact-root [data-hatch="dao-panel"] > #account-dismiss {
  display: flex !important; position: absolute; top: 0; left: calc(50% - 22px);
  align-items: flex-start; justify-content: center; width: 44px; height: 28px;
  padding: 8px 0 0; border: 0; background: transparent; touch-action: none;
  cursor: grab;
}
#exact-root [data-hatch="dao-panel"] > #account-dismiss::after {
  content: ""; width: 36px; height: 5px; border-radius: 3px;
  background: currentColor; opacity: .25;
}
@media (min-width: 768px) {
  #exact-root [data-hatch="dao-panel"][navigationPresentation="modal"] {
    inset: 0 !important; margin: auto !important;
    width: min(32rem, calc(100vw - 64px)) !important;
    height: fit-content !important; max-height: calc(100dvh - 64px) !important;
    border-radius: 24px !important; padding-bottom: 0;
  }
  #exact-root [data-hatch="dao-panel"] > #account-dismiss { display: none !important; }
}
`;
export function element(e) {
  if (mounted.has(e.element)) return;
  const panel = e.element;
  // Keep geometry through Exact's retained exit animation. The app lifetime,
  // not the route's removal, owns this stylesheet.
  if (!stylesheet) {
    stylesheet = document.createElement('style');
    stylesheet.textContent = styles;
    document.head.append(stylesheet);
  }
  let start = null, distance = 0, dragged = false, grip = null;
  const down = event => {
    grip = event.target.closest('#account-dismiss');
    if (!grip || event.button !== 0) return;
    start = event.clientY; distance = 0; dragged = false;
    grip.setPointerCapture(event.pointerId);
  };
  const move = event => {
    if (start === null) return;
    distance = Math.max(0, event.clientY - start);
    dragged ||= Math.abs(event.clientY - start) > 4;
    if (dragged) {
      panel.style.transition = 'none';
      panel.style.translate = `0 ${distance}px`;
    }
  };
  const end = event => {
    if (start === null) return;
    const dismiss = distance > 56 && event.type !== 'pointercancel';
    start = null;
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    panel.style.removeProperty('transition');
    panel.style.removeProperty('translate');
    if (dragged) event.preventDefault();
    if (dismiss) { dragged = false; grip.click(); dragged = true; }
  };
  const click = event => {
    if (dragged && event.target.closest('#account-dismiss')) {
      event.preventDefault(); event.stopImmediatePropagation(); dragged = false;
    }
  };
  // Route sheets use a shadow scrim, not HTMLDialogElement's backdrop.
  // Require both ends outside so a drag out of the card cannot dismiss it.
  let outsideDown = false;
  const outside = event => {
    const r = panel.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  const backdropDown = event => { outsideDown = event.button === 0 && outside(event) && !panel.inert; };
  const backdropUp = event => {
    if (outsideDown && outside(event) && !panel.inert) panel.querySelector('#account-dismiss')?.click();
    outsideDown = false;
  };
  document.addEventListener('pointerdown', backdropDown, true);
  document.addEventListener('pointerup', backdropUp, true);
  panel.addEventListener('click', click, true);
  panel.addEventListener('pointerdown', down);
  panel.addEventListener('pointermove', move);
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
  mounted.set(panel, () => {
    document.removeEventListener('pointerdown', backdropDown, true);
    document.removeEventListener('pointerup', backdropUp, true);
    panel.removeEventListener('click', click, true);
    panel.removeEventListener('pointerdown', down);
    panel.removeEventListener('pointermove', move);
    panel.removeEventListener('pointerup', end);
    panel.removeEventListener('pointercancel', end);
  });
}
export function elementEnded(e) {
  mounted.get(e.element)?.();
  mounted.delete(e.element);
}

export function appEnded() {
  stylesheet?.remove();
  stylesheet = null;
}
