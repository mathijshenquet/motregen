export const REPOSITORY_URL = 'https://github.com/mathijshenquet/motregen'

export default function About() {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement

  function open(): void {
    dialog.showModal()
  }

  function close(): void {
    dialog.close()
  }

  return <div class="source">
    <span>Bron: KNMI · Kaart: OpenFreeMap</span>
    <button ref={trigger} type="button" class="about-button" aria-haspopup="dialog" aria-label="Over motregen" title="Over motregen" onClick={open}>i</button>
    <dialog
      ref={dialog}
      class="about-dialog"
      aria-labelledby="about-title"
      onClose={() => trigger.focus()}
      onClick={(event) => { if (event.target === dialog) close() }}
    >
      <div class="about-body">
        <header>
          <img src="/droplet.svg" alt="" />
          <h2 id="about-title">Over motregen</h2>
          <button type="button" class="about-close" aria-label="Sluiten" onClick={close} autofocus>×</button>
        </header>
        <p class="about-lead">Data rechtstreeks van het KNMI. Gratis, zonder reclame, open source.</p>
        <p>Eén tijdlijn, van de regen die viel tot de verwachting voor morgen:</p>
        <dl>
          <dt>Radar</dt><dd>gemeten neerslag van de KNMI-radar, elke 5 minuten</dd>
          <dt>Nowcast</dt><dd>KNMI-neerslagverwachting voor de komende 2 uur</dd>
          <dt>Model</dt><dd>HARMONIE-AROME van het KNMI: regen, temperatuur, wind en bewolking</dd>
          <dt>UV</dt><dd>UV-index van het KNMI, inclusief bewolking</dd>
          <dt>Kaart</dt><dd><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, kaartdata © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers</dd>
        </dl>
        <p class="about-privacy">Geen tracking en geen advertenties. Je locatie en favorieten blijven in je eigen browser.</p>
        <a class="about-repo" href={REPOSITORY_URL} target="_blank" rel="noopener">Broncode op GitHub ↗</a>
      </div>
    </dialog>
  </div>
}
