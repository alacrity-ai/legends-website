# How to Add a New Show to the Website

> ⚠️ **DEPRECATED (as of v0.2).** New shows are now added through the **admin Event Form** at
> `https://admin.djkmdlegends.com` (the **Legends Admin** app) → **Create a Show**, which makes the Square checkout links for
> you automatically. See `docs/resources/1-SOPS.md` → SOP 2. This Google-Calendar guide is kept
> only for the 2 original "grandfathered" shows that still run on calendar links until ~September 2026.

Hi Keith! Follow these steps every time you have a new show to add. You'll need to do two things:

1. Create the event in **Google Calendar** (this puts it on the website)
2. Create a checkout link in **Square** (this lets people buy tickets)

---

## Part 1 — Create the Event in Google Calendar

This is what makes the show appear on the website under "Upcoming Shows."

1. Open Google Calendar on your phone or computer
2. Tap the **+** button to create a new event
3. Fill in the following:

   - **Title** — The name of the show (example: `DJKMD Presents Legends 5-17`)
   - **Date and time** — When the show starts
   - **Location** — The venue name and address (example: `The Blue Note, 123 Main St, Springfield`)

4. **Don't save yet!** — You still need to add the description (Part 3 below)

Leave this open and move on to Part 2.

---

## Part 2 — Create the Checkout Link in Square

This is what lets people actually pay for tickets.

1. Open the **Square Dashboard** on your phone or computer
2. Go to **Items** (or **Item Library**)
3. Tap **Create an Item**
4. Fill in:

   - **Item name** — Use the same name as the calendar event (example: `DJKMD Presents Legends 5-17`)
   - **Price** — The ticket price

5. Save the item
6. Now go to **Online Checkout** (it might be under **Payments** → **Online Checkout**)
7. Create a new checkout link for that item
8. Square will give you a link that looks like this:

   ```
   https://square.link/u/E0geS2r7
   ```

9. **Copy that link**

---

## Part 3 — Paste the Link into the Calendar Event

This is the step that connects everything together.

1. Go back to the Google Calendar event you started in Part 1
2. Find the **Description** box (you might need to tap "Add description" or "More options")
3. Type a short description of the show. For example:

   ```
   An all-star tribute from our professional performers to the music of
   Elvis, Cher, Neil Diamond, Frank & Nancy Sinatra, Dolly Parton,
   Amy Winehouse, and Bruno Mars.

   Dinner included with purchase!
   ```

4. **On its own line at the bottom**, paste the Square link you copied. Your description should now look like this:

   ```
   An all-star tribute from our professional performers to the music of
   Elvis, Cher, Neil Diamond, Frank & Nancy Sinatra, Dolly Parton,
   Amy Winehouse, and Bruno Mars.

   Dinner included with purchase!

   https://square.link/u/E0geS2r7
   ```

5. **Save the event**

---

## That's It!

Within a minute or two, the show will appear on the website. When someone clicks **Buy Tickets**, they'll see your description and a button that takes them to the Square checkout page.

---

## Quick Checklist

Use this every time you add a show:

- [ ] Created the event in Google Calendar with the title, date/time, and location
- [ ] Created the item and checkout link in Square
- [ ] Pasted the Square link at the bottom of the calendar event description
- [ ] Saved the calendar event

---

## Troubleshooting

**The show isn't appearing on the website**
- Make sure the event is on the correct Google Calendar (the DJKMD Legends one, not your personal calendar)
- Make sure the event date is in the future
- Wait a couple of minutes and refresh the page

**The "Buy Tickets" button says "coming soon" instead of "Buy Now"**
- Open the calendar event and check that the Square link is in the description
- Make sure the link starts with `https://square.link/u/`
- Make sure the link is on its own line (not smooshed into the middle of a sentence)

**The description on the website looks weird**
- Keep it simple — just type plain text, no bullet points or special formatting
- Put a blank line between paragraphs
- The Square link should always be the last thing in the description
