// Ask Essie — the slide between docked and open (snippets/essie-chat.liquid).
//
// Closed, the bar hangs from a sticky dock that comes to rest on the footer;
// open, it is fixed to the bottom of the viewport so the chat has the full
// height. With the footer in view those are two different places, so opening
// or closing would make the bar jump. This slides it instead: offset it back to
// where it was, then transition the offset away (FLIP).
//
// Both places are known from the dock alone — the bar sits the same gap above
// the dock as above the viewport's bottom edge — so nothing has to be measured
// before the change.

const essie = document.querySelector('[data-essie]');
const dock = essie?.closest('.essie-dock');

if (essie && dock) {
  new MutationObserver(() => {
    // How far the dock sits above the viewport's bottom edge: 0 until the
    // footer scrolls into view.
    const gap = window.innerHeight - dock.getBoundingClientRect().top;
    if (gap <= 0) return;

    // Opening moves the bar down by `gap`, so it starts `gap` higher; closing
    // the reverse.
    const from = essie.hasAttribute('data-open') ? -gap : gap;

    essie.classList.remove('is-moving');
    essie.style.translate = `0 ${from}px`;
    essie.getBoundingClientRect(); // commit the start position
    essie.classList.add('is-moving');
    essie.style.translate = '';

    const done = e => {
      if (e && (e.target !== essie || e.propertyName !== 'translate')) return;
      essie.classList.remove('is-moving');
      essie.removeEventListener('transitionend', done);
    };
    essie.addEventListener('transitionend', done);
    // Fallback if no transition runs (reduced motion zeroes the durations).
    setTimeout(done, 1000);
  }).observe(essie, { attributes: true, attributeFilter: ['data-open'] });
}
