(() => {
  // Artwork for the frame mode: put images in assets/art/ and list their file names here.
  const files = [];
  let layer, timer, index = 0, generation = 0, closing = false, previousFocus;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function schedule() { clearTimeout(timer); if (layer && !closing) timer = setTimeout(() => display((index + 1) % files.length), 300000); }
  async function display(next) {
    if (!files.length) return;
    const current = generation, image = new Image();
    image.alt = 'Tableau ' + (next + 1); image.draggable = false; image.src = 'assets/art/' + files[next];
    try { await image.decode(); } catch { schedule(); return; }
    if (!layer || closing || current !== generation) return;
    const old = layer.querySelector('img'); layer.append(image); index = next;
    requestAnimationFrame(() => requestAnimationFrame(() => { image.classList.add('visible'); if(old) old.classList.remove('visible'); }));
    if(old) setTimeout(() => old.remove(), 900);
    schedule();
  }
  async function open() {
    if (layer) return;
    previousFocus = document.activeElement; generation++; closing = false;
    document.body.classList.add('art-mode'); window.raspy.artMode(true);
    document.querySelector('#background-video')?.pause();
    layer = document.createElement('div'); layer.className = 'art-gallery'; layer.tabIndex = -1;
    layer.setAttribute('role','dialog'); layer.setAttribute('aria-modal','true'); layer.setAttribute('aria-label','Mode Tableau. Cliquez ou appuyez sur Échap pour revenir.');
    document.body.append(layer); layer.focus();
    requestAnimationFrame(() => requestAnimationFrame(() => layer?.classList.add('visible')));
    await display(index);
  }
  async function close() {
    if (!layer || closing) return;
    closing = true; generation++; clearTimeout(timer);
    // Stop the previous image load and reveal the existing homepage through a fade.
    document.body.classList.remove('art-mode');
    syncBackground(); layer.classList.remove('visible'); await wait(500);
    layer.remove(); layer = null; closing = false; window.raspy.artMode(false); heroSchedule();
    if(previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
  }
  document.addEventListener('click', event => {
    if (layer) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    else if(event.target.closest('[data-art]')) { event.preventDefault(); event.stopImmediatePropagation(); open(); }
  }, true);
  document.addEventListener('keydown', event => {
    if (!layer) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if(['Escape','Home','Enter',' '].includes(event.key)) close();
  }, true);
})();
