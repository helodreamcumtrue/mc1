/* =====================================================================
   YOUR CONTENT. This is the only file you need to edit to fill the world.

   1. Put your photos in  assets/photos/  (JPG, PNG or WebP, ideally under 600 KB each).
   2. For each place below, add pages to `entries`. Each page = one photo + one story.
   3. Place ids match the Wayfare Safe next to each place:

      taj, plainsvillage, indiagate, redfort, qutub, hawa, amber, jal, lakepalace, monsoon,
      rajvillage, dal, nishat, shankar, dharam, shimla, manali, oldmanali, spiti, chandratal

   Any place you leave out still has a Wayfare Safe, with a friendly "add your story here" page.
   Pages whose photo is missing show a placeholder card instead of a broken image.
   ===================================================================== */
window.SITE = {
  owner: 'Lakshay',
  worldTitle: "Lakshay's World",
  tagline: "Photos, stories and lessons from the places I've been.",

  places: {

    // ---- EXAMPLE: delete or replace this with your own text ------------------------------
    lakepalace: {
      entries: [
        {
          photo: 'assets/photos/udaipur-1.jpg',            // path to your photo
          title: 'Udaipur at golden hour',
          date: 'Add a date',
          caption: 'Lake Pichola, Udaipur',
          story: 'SAMPLE TEXT: replace this with your own story. Where were you standing? What did you see, smell, hear? Short paragraphs read best in the book.',
          learning: 'SAMPLE TEXT: what did this place teach you?'
        },
        {
          photo: 'assets/photos/udaipur-2.jpg',
          title: 'Boat ride across the lake',
          date: 'Add a date',
          caption: 'On the water',
          story: 'SAMPLE TEXT: add as many pages as you like. Visitors turn pages by scrolling.',
          learning: 'SAMPLE TEXT: one honest lesson per page works well.'
        }
      ]
    },

    taj: {
      entries: [
        {
          photo: 'assets/photos/taj-1.jpg',
          title: 'First look at the Taj',
          date: 'Add a date',
          caption: 'Taj Mahal, Agra',
          story: 'SAMPLE TEXT: write about your visit here.',
          learning: 'SAMPLE TEXT: what you took away from it.'
        }
      ]
    }

    // ---- add more places the same way, using the ids listed at the top ------------------
    // dal: { entries: [ { photo: 'assets/photos/dal-1.jpg', title: '', date: '', caption: '', story: '', learning: '' } ] },
  }
};
