## UI elements, expressed by comprehensive user workflow

*This is an end-to-end user story describing the data flow & full process. It should identify nearly all UI elements needed, and should help to flush out any unasked UI questions.*

*Language: all UI text is Dutch; the spec's prose is English. Quoted strings, and the names given for pages, fields, columns, filters and buttons, are the literal Dutch labels to use. Anything the spec only describes in English gets a Dutch label at build time, in the same style. Loanwords that are normal in Dutch (e-mail, PDF, CSV, dossier, status, pop-up) are fine. Roles in the UI are Beheerder (called "admin" in this prose) and Klusser; the outside parties are Bewoner and Woningcorporatie.*

*Huisstijl (per* `tmp/reference/Huisstijlhandout Ulebelt - oktober 2025.pdf`*): the UI and all PDFs use the Figtree font (Regular for body text, Extra Bold for headings) and the Ulebelt logo top-left (navbar, PDF header), from the official logo files. Palette: crème* `#f7f0e5` *(page background), lichtgroen* `#88d356`*, donkergroen* `#00643c` *(primary buttons, links), blauw* `#86afe2`*, aubergine* `#462832`*, oranje* `#ff713e`*, zwart* `#1a1a1a`*, wit. The status colors below use the nearest palette tone where one fits (blauw, oranje, aubergine); warning red and the yellow status stay as they are, because their meaning matters more than the brand. Brand oranje means Klusser only. Warnings use Bootstrap's warning color (*`text-warning`*, and* `bg-warning`*/*`border-warning` *where filled), themed to amber:* `#f0a500` *for fills and borders,* `#9a6200` *for text on crème. Wherever this spec says* `text-warning` *it means that semantic warning color, not Bootstrap's literal class: override* `.text-warning` *to the dark amber, because Bootstrap's default paints text in the light fill color. The Bewoner yellow is a pale lemon (*`#f2d74e`*), so it can't be mistaken for amber.*

### 1. Admin adds the client and sets up the on-site visit

- Admin receives an email alert from the online aanmelding form where residents express interest in having a rainwater capture system.
- They log into our portal at https://regenwater.ulebelt.nl - if not already logged in they enter their email address and click the emailed login link (or type the emailed code).
- Once logged in, they land on the Overzicht and go to the Dossiers list. Click on "+ Nieuw dossier" to open the Intake form. Fill in the address and basic prep information (huur of koop, subsidie eligibility, street view, validate or adjust the kadastrale kaart, boorprofiel, etc) then assign a klusser as bezoeker and send them an email saying they've been assigned.

### 2. Klusser schedules and does the on-site

- Bezoeker receives the email notification that they're being asked to do an on-site. They tap the link, see the person's contact details, call or email them, arrange an afspraak date & time, enter it in on the page.
- Then when on-site, the bezoeker returns to the dossier page and clicks "Start bezoek" to open up the bezoek details form.
- ...

## UI per page

- Login page
  - If you're already logged in, it redirects admins to the Overzicht and klussers to Mijn dossiers. The same applies right after logging in.
  - If you're not logged in, display an email address form. Enter your email and submit. If that email is not in our system, display an error message saying so and asking you to contact the Ulebelt contact address (a constant in code). Archived users get the same message. If that email IS found, send that email a login link plus a 6-digit code, and display a confirmation message with a code input field.
    - *Why the code: on phones, mail apps often open links in their own built-in browser, so the login cookie lands there instead of in Safari/Chrome. Typing the code into the browser they actually use avoids that.*
    - The email shows the code first, then the link, with wording like "Op je telefoon: typ deze code in. Op een computer: klik op de link."
    - The link opens an otherwise empty page with one centered "Inloggen" button; only tapping it logs in. *Mail scanners (eg Outlook Safe Links) open every link in an email, which would use up a one-use link.*
    - Sessions last 30 days.
    - A code and link stay valid for 15 minutes and for one use; requesting a new one invalidates the old. After 5 wrong codes the code is void and you request a new one. At most 5 login emails per address per hour, and at most 20 login requests or code attempts per IP address per hour. (All constants in code.)
    - Hitting any of these limits, a voided code included, records a "login geblokkeerd" audit event (e-mail address, IP address, which limit) and logs a warning, which trips the Healthchecks error alert to the maintainer (see Monitoring in `architecture.md`). A single wrong code doesn't.
- "Overzicht" (admins only)
  - Reached by clicking the logo (no navbar link). Admin landing page. Just a table of overall counts:
    - Open dossiers
    - Aandacht nodig (red text)
    - Wacht op bezoek (steps 3-4)
    - Wacht op woningcorporatie
    - Gesloten (gray text: closed for any reden)
    - Uitgevoerd (green text: the subset of gesloten with reden Uitgevoerd, the success case)
    - Next to each, a filtered list link for listing just those dossiers.
    - And then, a separate table of basic info on each user, beheerders first, with the same columns as the Gebruikers list minus E-mail and Telefoon: Naam, Rol, Laatst actief, Open dossiers, Gesloten dossiers.
  - At bottom, a centered btn-primary "Alle dossiers zien"
- "Dossiers" list
  - Linked in the navbar.
  - When viewed by admins:
    - Title: "Alle dossiers"
    - Top-right: "+ Nieuw dossier" button ("+ Nieuw" on phones), & a caret-only menu holding "CSV downloaden" (admins only; the server refuses it for klussers). The CSV holds all dossiers matching the current filters, ignoring pagination, in the current sort order, one row per dossier: Dossier-ID, Aangemaakt op, Straat, Huisnummer, Postcode, Plaats, Gemeente, Huur/koop, Woningeigenaar, Woningtype, Rioolstelsel, Bewoner naam, e-mail and telefoon, Bezoeker, Uitvoerder, Status, Aandacht nodig (ja/nee), every milestone date (subsidiemail, bezoeker toegewezen, afspraak, bezoek afgerond, klaar voor controle, plan verstuurd naar bewoner, plan verstuurd naar woningcorporatie, akkoord, uitvoerder toegewezen, uitvoering gepland, werk opgeleverd, opleverrapport verstuurd, gesloten), Reden gesloten, Dak m² (totaal), Aantal regenpijpen, Regentonnen gewenst, Geschatte materiaalkosten, Gebruikte materiaalkosten. Dates as `YYYY-MM-DD`, amounts as plain numbers, so Excel can sum them.
    - Bar of overall stats: Open, Aandacht nodig, Uitgevoerd.
    - Filters bar, one row on desktop (each select a fixed narrow width, labeled inside its value, eg "Plaats: alle"):
      - Adres (text filter/match)
      - Plaats
      - Bezoeker (all beheerders and klussers)
      - Uitvoerder (all beheerders and klussers)
      - Ligt bij: Beheerder, Klusser, Woningcorporatie, Bewoner
      - Aandacht (checkbox). Applies to closed dossiers too when Gesloten is "- alle -" or "Ja", so a closed dossier with a Klopt niet finding can be found.
      - "Status" dropdown (Bootstrap simulated dropdown) - clicking each item cycles its setting state between "Ja", "Nee", and "- alle -". Each item asks whether that milestone is recorded.
        - Bezoeker toegewezen (default: alle)
        - Bezoek gedaan (alle)
        - Plan verstuurd (alle): to the corporatie if huur, to the bewoner if koop
        - Akkoord (alle): corporatie approved (huur) or bewoner chose the Klussendienst (koop). A rejection is a closing, found under Gesloten.
        - Uitvoerder toegewezen (alle)
        - Werk opgeleverd (alle)
        - Gesloten (default: nee)
        - Uitgevoerd (alle)
      - Sorteren: a compact menu button showing a sort icon and the current choice: Nieuwste (default), Oudste, Laatste activiteit, Adres (A-Z), Stap (in stap-volgorde), Eerstvolgende afspraak.
    - 30 dossiers per page, with page links below the table.
    - Table of dossiers:
      - Adres
      - Huur/koop
      - Klusser: the uitvoerder once one is assigned, otherwise the bezoeker. The details page keeps both.
      - Status: the current step from the status table (see "Statussen" below), as a label color-coded by who it lies with: light blue for Beheerder, orange for Klusser, purple for Woningcorporatie, yellow for Bewoner. Closed dossiers show "Gesloten: {reden}" in gray (gray is reserved for closed).
      - Laatste activiteit (date of the dossier's most recent audit event)
      - Notities
    - **Responsive design:** On narrow screens, this table is replaced with a list of div cards which show the following info:
      - Adres (top left, 1 line)
      - Status label (top right)
      - Second line: bezoeker/uitvoerder name, and the afspraak date if one is upcoming
      - Red "aandacht" badge if applicable
  - When viewed by klussers:
    - Title "Mijn dossiers". No "+ Nieuw dossier", CSV, stats bar, or klusser filter.
    - Only lists dossiers where that person is the bezoeker or uitvoerder.
    - Dossiers where it's currently their turn (steps 3-5 as bezoeker, step 10 as uitvoerder) are listed first; the rest are shown below in muted text.
    - Columns: Adres, Opdracht, Volgende stap, Afspraak, Laatste activiteit.
      - **Opdracht** follows this person's own role on the dossier, not the dossier's phase: "Bezoek" (visit the bewoner, gather data, draft the Plan van Aanpak) or "Uitvoering" (carry out an already agreed plan). While it's their turn, the badge is filled donkergroen. Otherwise it's a gray outline badge, with a ✓ once their part is done (eg "✓ Bezoek" after "Klaar voor controle", "✓ Uitvoering" after "Werk opgeleverd"). Someone who is both bezoeker and uitvoerder sees whichever role is current: "✓ Bezoek" while the plan is with the admins or corporatie, then a filled "Uitvoering" at step 10.
      - **Volgende stap**, when it isn't their turn, is plain muted text naming the step and who it's with (eg "Wordt uitgevoerd door Henk", "Wacht op Ieder1"), not the colored status label, so nothing suggests they need to act.
    - On narrow screens, the same card layout as admins, with the Opdracht badge before the address.
- Dossier details page
  - *The page has one section per phase, in process order. The rule for what goes where: a form that someone sits down to fill in, with many fields, gets its own sub-page; a single field or a button stays inline on the details page, next to the summary the "Volgende stap" points to. That gives four sub-pages, each filled by one person in one moment: **Intake** (admin, at the desk), **Bezoek** (bezoeker, on-site), **Plan van Aanpak** (bezoeker afterwards, then admin during review) and **Uitvoering** (uitvoerder). On the details page each of these shows as a compact, text-only summary of every field the sub-page has (a label column, then the value: option labels, Anders write-ins, textareas with their line breaks, photos as small thumbnails that open the same annotator as on the sub-page (autosaved, editable by whoever may edit that field), empty fields as "--", fields the sub-page hides hidden here too), with a button to the sub-page. While the step is open that button sits at the bottom of the section; once its milestone is set it moves to the section's top right corner as a small pencil "Bewerken" (or eye "Bekijken" for someone who can't edit). Each sub-page has the address as title, the same banners, and a "← Terug naar dossier" link.*
  - *Permissions: admins view and edit everything. Klussers view all sections of their assigned dossiers. As bezoeker they edit the afspraak, the Bezoek and Plan van Aanpak sub-pages, and Notities, until they tap "Klaar voor controle"; as uitvoerder, the uitvoering date, the Uitvoering sub-page, and Notities, until they tap "Werk opgeleverd". After that they only view, and ask an admin for any change. Intake is read-only for klussers; assigning, sending, approving and closing are admin-only. A closed dossier is read-only for everyone, admins included: only viewing, PDFs, Alle activiteit, sending the opleverrapport (again) to the corporatie or bewoner, heropenen and verwijderen. Reopen it to change anything else.*
  - *All changes on this page and subpage forms, incl photo uploads and annotations, will autosave as soon as you make them.*
    - A floating status indicator in the bottom right corner indicates that all changes will autosave, and shows the latest time saved (eg "Opgeslagen om 19:04")
    - Each field saves on its own (PATCH per field, not the whole form), so an admin and a klusser editing the same dossier don't overwrite each other's fields (last write wins per field). All annotations on one image are a single field, so two people drawing on the same kaart at once can overwrite each other; accepted as rare.
    - Unsent changes are queued in localStorage before sending, so a reload or a dropped connection in a backyard loses nothing; the queue resends when the connection returns. Photo uploads have their own queue, in IndexedDB.
    - If any changes are delayed in autosaving, display a `text-warning` "Bezig met opslaan..." indicator. If any changes FAIL to autosave, display a red "Opslaan mislukt" indicator and show a red pop-up warning; keep retrying until save succeeds. Navigating away while the queue is non-empty triggers a browser "unsaved changes" warning.
    - Every audit entry records each changed field's old and new value, so any earlier state of a dossier can be reconstructed. Adjacent autosaves merge into one entry, keeping each field's first old value and last new value, only if they're by the same person, within an hour of that entry's first save (a constant in code), and with no other event on the dossier in between (another person's edit, a milestone, an email send). The send boundary keeps "changes since this send" exact. Annotations are logged as the before/after JSON; photos as added/removed photo ids, and a removed photo's file is kept until the dossier itself is deleted.
    - `plan_gewijzigd_at`: one timestamp on the dossier, bumped by the server whenever a field that appears in the Plan van Aanpak PDF actually changes (incl. photos and kaart annotations). The field definitions in code mark which fields are in the PDF, so this needs no per-field timestamps. The audit trail shows exactly what changed.
  - *For each input with optional photo upload slots, it's a 2-column system where you write in the left and the right (by default narrow) column has a "Foto maken" button you can tap on to open your camera and take a pic and it will be downscaled and uploaded and attached (or drop image files on it; see the photo slot rules under Straatfoto). Tap a pic then tap "Verwijderen" to remove it. Multiple photos can be attached to any such slot, though usually it will be 0-1 in a given slot.*
  - *Every email the app sends to a person outside the admin team (bewoner, corporatie, klusser) goes through the same preview pop-up, opened by a button:*
    - Aan: prefilled (bewoner's e-mail, the corporatie's address constant, the klusser's account e-mail) but editable; validated as an e-mail address. Onderwerp and tekst are editable too, prefilled from the template.
    - The onderwerp and tekst arrive with the template's `{tags}` already filled in for this dossier, so the pop-up shows exactly the mail that will be sent, and it's sent as edited. If a required value is no longer in the text (eg the dossier link in a klusser email), the pop-up shows a warning and "Versturen" then asks "Weet je het zeker?" before sending.
    - Edits apply to this one send only; to change the standard text, edit the template under Beheer > E-mailsjablonen. The sent subject and text are stored in the audit trail.
    - Red .alert.alert-danger at top if this email (same template, same dossier) was already sent, with the date.
    - CC'd to the admin who sends it (pending the team question about a shared inbox).
    - Attachments (the PDF) are listed by name; they're generated at send time.
    - On its own line below "Annuleren"/"Versturen", at the left, a link "Handmatig verstuurd...": for when the admin downloaded the PDF and emailed it themselves. Since it sends nothing, it first asks for confirmation that the app won't send this email and that they sent it themselves. It records a send at the current time exactly like "Versturen" does (it counts for the status, the aandacht clocks and Plan gewijzigd), shown as "Handmatig verstuurd op {datum}".
  - Title: this address
  - If the dossier is closed: a prominent gray banner directly under the title, "Gesloten op {datum}: {reden}" (green for Uitgevoerd).
  - If the dossier needs aandacht (closed ones included, for Klopt niet): one .alert.alert-danger banner directly under the title, one bullet per finding (Klopt niet findings first), each linking to the relevant field or section (see the Aandacht-criteria page).
  - Top-right corner (next to title): a wordless caret dropdown menu with actions available for this property.
    - (admin) Dossier sluiten (eg if the huurder moved). Pops up a reden choice (Bewoner afgehaakt, Bewoner doet het zelf, Plan afgewezen, Niet subsidiabel, Anders, and last "Toch uitgevoerd", which stores reden Uitgevoerd for work finished outside the normal flow) and a Toelichting field, stored with the closing and shown in the gray banner, with an encouragement to add a note about why it's getting shelved. For "Toch uitgevoerd" the toelichting is required: explain what happened.
    - (admin, if closed) Dossier heropenen. Clears the closed state; the status returns to whatever step the dossier's data implies.
    - (admin) Dossier verwijderen. Pops up a warning that this permanently deletes the dossier with all its data, photos and audit entries, and can't be undone; for anything but a duplicate or a privacy request, close the dossier instead. Buttons: "Dossier sluiten" (primary, opens the close pop-up) and a red "Definitief verwijderen". One "dossier verwijderd" audit event remains, naming the adres and who deleted it.
    - (admin, if a "ligt stil" aandacht is shown) Aandacht uitstellen. Pick a date and write a required note (eg "Ieder1 gebeld, reageren volgende week").
    - (admin) "Alle activiteit" => leads to a subpage with an audit trail of all events on this dossier (title bar has N events & info about the last update, by whom & what fields/content were changed)
  - **Status**
    - Volgende stap
      - To the right of this label, a "?" link to the Statussen page, so the app documents its own rules.
      - Displays the calculated current next step for this record, with one action: a button that opens the step's sub-page ("Intake invullen", "Start bezoek", "Plan van Aanpak invullen", "Uitvoering invullen"), or else a tap that scrolls to the inline section where the step happens (Bezoeker, the afspraak field, Plan versturen & goedkeuring, Uitvoerder, Oplevering).
    - Notities
      - free-form notes the admin & klusser can write whatever is relevant in. Shown as one line of text ("--" if empty) with a pencil "Bewerken" link for whoever may edit; that link opens an autofocused textarea, which closes back to text when it loses focus.
  - **Intake** (sub-page, admin)
    - *"+ Nieuw dossier" creates the dossier and opens this sub-page.*
    - On the details page, inline: the compact summary (address; bewoner on one line as "naam • telefoon • e-mail", telefoon as a tap-to-call `tel:` link and e-mail as a `mailto:` link; woning, rioolstelsel, whether the eligibility mail was sent (a `text-warning` "Nog niet verstuurd" if not), straatfoto, kaart (luchtfoto op schaal or screenshot), boorprofiel, boorlocatie, bodemsituatie; for a gescheiden riool one line saying those last five aren't needed), "Intake is compleet" with its date once marked, and an "Intake invullen" / "Bewerken" button to the sub-page.
    - Adres
      - Enter the address in a free-form text input (eg street name, number, plaats; or postcode & number) and the API will suggest the best matching address. Click it to populate that validated address.
      - Autocompletes using the PDOK Locatieserver (`/suggest` while typing, then `/lookup` for the chosen result; `/free?q=` as fallback). Our app stores the validated street name, number, plaats, postcode, `gekoppeld_perceel`, centerpoint in both RD and lat/long systems, and `gemeentenaam`.
      - We additionally look up the parcel boundary and store its dimensions. (either from the Locatieserver with `fq=type:perceel` for that parcel, which gives `geometrie_rd` , or from the kadaster WFS service.) `gekoppeld_perceel` can list several parcels (eg one for the house and one for the garden): store them all, and frame the luchtfoto on the combined bounding box.
      - Once chosen, the address shows as one line ("Walstraat 74, 7411GK Deventer"; gemeente is stored but not shown) with a pencil icon at the end; tapping it reopens the search input, focused, to pick another address.
      - If another dossier, open or closed, has the same address (postcode, huisnummer and toevoeging), a red warning links to it: "Er bestaat al een dossier voor dit adres: {adres} ({status})". It doesn't block anything; a second dossier for one address can be legitimate.
    - Naam bewoner
    - E-mail bewoner
    - Telefoon bewoner
    - Huurwoning of koopwoning
    - (if huurwoning) Woningeigenaar (dropdown)
      - Options: Ieder1, Rentree, Salland Wonen, Anders, namelijk: (write-in)
    - Woningtype (dropdown)
      - Options: Tussenwoning, Hoekwoning, Geschakeld, 2-onder-1-kap, Vrijstaand, Benedenwoning, Anders, namelijk: (write-in)
    - Rioolstelsel (gemengd, gescheiden)
      - *Gemengd = subsidy-eligible. Gescheiden = not subsidiabel.*
      - To the right of the label, a button "Rioolkaart" that opens the gemeente's rioolkaart (at that address, if doable; see Wishlist), from a per-gemeente link constant in code. For a gemeente without a known link, a red message instead: "Voor {gemeente} is nog geen rioolkaart bekend. Vraag de ontwikkelaar om {gemeente} toe te voegen."
        - Deventer: https://deventer.maps.arcgis.com/apps/webappviewer/index.html?id=f981cd8df5744a18aa87f59998905764
        - Raalte: https://experience.arcgis.com/experience/8b52137b53714e35a54b3a4e8f1217e8
        - Olst-Wijhe: https://olst-wijhe.maps.arcgis.com/apps/instant/basic/index.html?appid=859f1b244196497e9f13df1f7c136676
      - Below the label, the app's own guess from the gemeente's rioolkaart, looked up when the address is chosen: "Autodetectie denkt dat het riool op dit adres **gemengd** is." (green; gescheiden in red), followed by the evidence (eg "Gemengd riool op 6 m, geen huisaansluiting gevonden") and "Controleer dit zelf op de rioolkaart." It never fills in the field. When the source can't tell, it says so; for a gemeente without detection: "Autodetectie van het riool wordt voor {gemeente} nog niet ondersteund."; when the lookup fails, the error in red. Supported: Deventer (nearest house connection within 15 m, else nearest main within 40 m), Raalte and Olst-Wijhe (their subsidie category per pand, in their own words; in Olst-Wijhe some gescheiden panden are still subsidiabel).
      - *No "keuze wissen" field needed.*
    - 📧 Mail aan bewoner over subsidie
      - This is a label, but instead of an input field there's a "Mail bewoner: {variant}" button, shown once huur/koop and rioolstelsel are set. The variant follows from them: "subsidiabel, huurwoning", "subsidiabel, koopwoning" or "niet subsidiabel", each with its own template (the subsidiabel ones say a vrijwilliger will come by and link to the subsidie info; the niet subsidiabel one points to the info on the website). It opens the email preview pop-up. If already mailed, say "✅ Verstuurd op {datum} (subsidiabel, huurwoning)" in green italics but then show the button anyway so you can always re-mail.
    - If not subsidiabel, hide all remaining steps of this form and instead say so in muted text (they come back when the rioolstelsel is set to Gemengd), followed by a red button "Dossier sluiten: niet subsidiabel" (reden Niet subsidiabel).
    - Straatfoto / vooraanzicht
      - To the right of the label, button-link to open Google Maps at that address so you can get a Street View screenshot.
      - Single photo upload slot. **All photo upload slots work as follows:**
        - Tap the button to take or select photos, or (on desktop) drag image files onto the slot: the whole slot, thumbnails included, is a drop zone, highlighted while you drag over it. Several files can be dropped at once. While files convert or upload, the slot shows a spinner with "Uploaden..." next to the thumbnails, without moving the page. Every image (JPG, PNG, WebP, GIF, SVG, or HEIC where the browser can read it) is converted in the browser to a 1200px (longest side) jpg before upload. A file that can't be read as an image (eg a PDF), or an upload the server rejects, shows a red pop-up naming the file: "{bestand} kon niet worden toegevoegd. Gebruik een JPG- of PNG-afbeelding." An upload that fails for lack of a connection just waits in the queue.
        - Dropping or selecting one file on a slot that already holds exactly one photo asks, while the file converts, "Foto toevoegen of vervangen?" with "Vervangen" (the default button) and "Nog een toevoegen". Vervangen removes the old photo and its annotations (the kadasterkaart keeps its annotations instead; see Plattegrond). With 0 or 2+ photos, or several files at once, they're simply added.
        - If a photo is uploaded, it's displayed in thumbnail form; click/tap it to view it in a full-screen overlay. The large pop-up has a toolbar at the top with buttons to: select (hand icon), annotate with **Pijl** (`arrow-up-right` icon) or **Tekst** (a bold serif "T"), and delete this photo (trash icon, "Foto verwijderen", "Foto" on phones; w confirm pop-up). Pijl and Tekst are the only annotation tools on ordinary photos; the kadasterkaart adds semantic tools (see "Plattegrond intekenen"). In select mode the mouse cursor turns into a hand over anything that can be selected or dragged. Any annotation can be tapped/clicked to select it (tap again to select another annotation behind it if several overlap); an eraser icon button then appears in the toolbar so you can delete just that one item (`backspace`/`delete` on desktop). Drag to move the selected annotation; double-tap a text element to edit its text (no resize or other operations for now). Undo icon button or `Ctrl/Cmd + Z` to undo the last annotation addition/move/deletion. Pinch or scroll to zoom (no zoom buttons; the hint line says so). Indicator text in the toolbar showing the last save time (all changes are immediately autosaved). `esc` cancels a WIP arrow or polygon. Toolbar top-right has a green X button to close the overlay.
    - Plattegrond van kadaster
      - To the right of the label:
        - Button to auto-load the luchtfoto: pops open a full-screen overlay with the satellite photo around the parcel boundaries; pinch/slider to zoom and drag to pan until the framing is right. Click "Opslaan" and the app re-requests the WMS for exactly that framed area at high resolution (sharper than cropping the preview), and stores that image plus its meter dimensions, so measurements on the kaart are to scale.
          - API details: we'd need the `Actueel_orthoHR` (satellite imagery) base layer + the overlay layers of `Perceel,KadastraleGrens,Bebouwing,Label with TRANSPARENT=true` , then merge them.
        - Link to open the kadastrale kaart at that address (as a failsafe way to manually grab a screenshot of the map).
      - Single photo slot. Supports the semantic kaart tools described under "Plattegrond intekenen" below; the admin may already draw daken, regenpijpen and tuin here, and the bezoeker corrects & completes them on-site.
      - A manually uploaded screenshot has no known scale, so no measurements are calculated on it; the Dakdelen and Tuindelen tables then nudge (but don't require) you to enter each m² by hand.
      - Replacing the image keeps all annotations, and shows a `text-warning` warning: "Je hebt de kaart vervangen, dus de tekeningen kloppen mogelijk niet meer. Verplaats of pas ze aan waar nodig."
    - Boorprofiel
      - Button-link to "Dichtstbijzijnde boring" which opens up BROloket & auto-finds the nearest boormonsterprofiel. *Build note: it doesn't find one for every address, so test it against a range of addresses.*
      - Link to [DINOloket](https://www.dinoloket.nl/ondergrondgegevens) where user can look up by address themself, in case the "Dichtstbijzijnde boring" button didn't work.
      - Also to right of label, a link that opens the doorlaatbaarheid per grondsoort reference table (see the PDF Bijlage) in a pop-up.
      - Single image slot, same functioning as above.
      - Boorlocatie (text, eg "Voorbeeldplein, Deventer"): where the boring was taken, printed with the boorprofiel in the PDF.
    - Bodemsituatie (radio), filled in from the boorprofiel so it's known before the bezoek:
      - Zand, fijn tot midden, goed doorlaatbaar
      - Zand, grof, zeer goed doorlaatbaar
      - Lemig of siltig zand, matig doorlaatbaar
      - Zavel (zandige klei), matig tot slecht doorlaatbaar
      - Klei, slecht doorlaatbaar
      - Leem, slecht doorlaatbaar
      - Veen, wisselend tot slecht doorlaatbaar
      - Anders, namelijk: (write-in)
    - At the bottom: a `text-warning` "Nog niet ingevuld: {velden}" list (Adres, naam or e-mail bewoner, huur/koop, rioolstelsel, the eligibility mail; bodemsituatie, boorprofiel and kaart aren't required), and an "Intake is compleet" button. The admin decides: with fields still missing it first asks "Toch als compleet markeren?". Marking it stores the milestone (when, by whom; admins can undo it) and goes to the dossier's Bezoeker section.
  - **Bezoeker** (inline, admin)
    - Until the intake is marked compleet, only the line "Je kunt een bezoeker toewijzen zodra de intake compleet is."
    - searchable dropdown where you assign any beheerder or klusser to do the on-site.
    - While no bezoeker is assigned: a "Kopieer oproep voor Signal-groep" button that copies a call for volunteers to the clipboard, from the "Oproep Signal-groep" template with its tags filled in. Its tags are only `{straat}`, `{plaats}` and `{afzender}` (no huisnummer or bewoner name, for privacy). Default text: "Nieuwe klus voor regenwater-infiltratie in de {straat} in {plaats}. Wie wil er op bezoek? Reageer hier of app {afzender}." Mostly used for koopwoningen.
    - The dropdown's last option, "+ Nieuwe klusser", opens the "+ Nieuwe gebruiker" form (see Gebruikers) in a pop-up, with Rol fixed to Klusser. Saving creates the account, assigns them as bezoeker, and continues to the notify pop-up below; that email's link is also how they first log in. The Uitvoerder dropdown has the same option.
    - Changing the bezoeker after "Bezoek afronden" first asks "Hiermee verandert ook 'Schouw door' in het Plan van Aanpak van {oud} naar {nieuw}. Weet je het zeker?"
    - When you select a bezoeker, the email preview pop-up asks if you want to notify them. Click "Ja, versturen" to notify them, or "Annuleren" to skip it. Notifying marks the record as notified, stores the timestamp, and displays a small green "Verstuurd op {datum}" on the same row as the dropdown. Until then a "Bezoeker mailen" button sits there; once sent, a link "Opnieuw mailen" at the end of the Verstuurd line replaces it.
      - The email template just notifies the klusser that they've been assigned this address <address>, please click on <button link to the dossier page> to view the bewoner's contact details and schedule an afspraak.
  - **Bezoek** (sub-page, bezoeker on-site: what's actually there)
    - On the details page, inline:
      - Bezoek-afspraak: native date and time inputs (`type="date"`, `type="time"`), which give phones their own pickers. *Normally the klusser arranges it with the bewoner by phone, days before the bezoek.*
      - Link "Printbaar bezoekformulier (PDF)", for klussers who'd rather not use a phone on-site. The admin prints it and gives it to the klusser. It's prefilled with what's already known (adres, bewoner contact, afspraak, straatfoto, the kadasterkaart with its current tekeningen, dakdelen & regenpijpen so far) and has blank space for every Bezoek and Plan van Aanpak question. Someone (usually the admin) types it up into the app afterwards.
      - Its generic twin, "Leeg bezoekformulier (PDF)" (in the Beheer dropdown), has no dossier data at all: blank lines for adres, bewoner and datum, a blank sketch box instead of the kaart, and a few blank regenpijp blocks (A to D). Admins print a stack in advance so a vrijwilliger can grab one without anyone preparing a dossier-specific form. Both are rendered from the same form definitions in code as the Bezoek and Plan van Aanpak pages, so a new question appears on paper automatically.
      - The compact summary (one line per dak with m², regenpijpen and waterberging; per tuin m² and photos; verhard; tuinsituatie; per regenpijp one line "van D1 · PVC · 80 mm · Regenton: ... · Afkoppelen: ..." with Ondergrond / Water naar / Via lines below; hoosbuien; wensen), and a "Start bezoek" / "Bewerken" button to the sub-page.
    - Plattegrond intekenen
      - The same kadasterkaart image slot as in Intake, with the same annotations; shown again here because the bezoeker now records what's actually found on-site. Same buttons to auto-load the luchtfoto or open the kadasterkaart; the image can be replaced (annotations are kept, with the warning described in Intake).
      - Tap it to open full-screen. Besides Pijl and Tekst, the kaart has three semantic tools whose annotations feed the form below and the Plan van Aanpak:
        - **Dak** (polygon, numbered D1, D2...): adds a row to the Dak delen table.
        - **Regenpijp** (point, lettered A, B, C...): adds a regenpijp section below, and is automatically linked to the nearest dakdeel (inside it, or else the closest edge). The link can be overridden in that regenpijp's section.
        - **Tuin** (polygon, numbered T1, T2...): adds a row to the Tuindelen table.
      - On a scaled kaart (auto-loaded luchtfoto), each dak/tuin polygon shows its side lengths and its area in the center.
      - Phone-friendly controls:
        - Big tool buttons in the toolbar; the active tool stays highlighted, and a one-line hint says what to do next (eg "Tik de hoeken van het dak aan. Tik op het eerste punt of op Klaar om te sluiten.").
        - Two-finger pinch & drag zooms and pans; one finger draws or selects. That way you can zoom in to place corners accurately.
        - Selecting a dak/tuin polygon shows draggable corner handles, so an outline the admin drew roughly can be corrected on-site without redrawing it.
      - Deleting a dak, tuin or regenpijp deletes its form data too, and the remaining items are renumbered/relettered everywhere in the form (each keeps its stable internal ID; only the shown label changes). Undo restores it including its data. The confirm prompt says so, and warns that free text mentioning items by letter or number (eg "pijp C") isn't updated automatically, so the user should check it.
    - "Dak" (table)
      - 1 row per dakdeel: number (eg "D1"), m² (auto-calculated; a manual input if the kaart isn't to scale), # regenpijpen (from the links), waterberging per regenpijp (m² ÷ # regenpijpen × normafvoer). The waterberging cell shows its calculation in small gray text (eg "18 m² ÷ 2 × 20 mm = 180 liter"), here and in the PDF, so anyone can check it. A dakdeel with no regenpijp linked shows "-- (geen regenpijp)" in that cell, here and in the PDF, and the Controle text lists it.
      - Footnotes as on the sample: "\* bron: kadastrale kaart (PDOK)" and "\*\* per regenpijp gebaseerd op normafvoer 20 mm regenwater". The 20 mm is a constant in code (tentative, pending the team question).
      - If no dak is drawn on the kaart yet: red warning "Er is nog geen dak ingetekend op de kadasterkaart" with a link that scrolls back up to the kaart.
    - Tuin
      - "Tuin" table: 1 row per tuindeel, with number (eg "T1") and m² (auto-calculated, or manual input as above). In a 3rd column, photos can be uploaded and annotated, same as the other image slots, to capture the current situation of the garden.
      - If no tuin is drawn on the kaart yet: red warning "Er is nog geen tuin ingetekend op de kadasterkaart" with a link that scrolls back up to the kaart.
      - Verhard (number input, 0-100 %): how much of the whole tuin is paved (terras, pad, tegels).
      - Tuinsituatie & infiltratie (textarea, with optional photo upload slots)
        - *Hint: Is de tuin groot en groen genoeg om het water te laten infiltreren, ook bij piekafvoer? Welke obstakels zijn er (terras, pad, hoogteverschil)? Is er een wadi nodig?*
    - For each regenpijp identified on the kaart: (collapsible section)
      - Voert af van: dropdown of dakdelen, preset to the nearest one.
      - Soort (radio options: PVC, Zink, Anders, namelijk... (write-in))
      - Diameter (radio options: 80mm, 100mm, Anders, namelijk... (write-in))
      - Regenton aanwezig? - radio options:
        - Is al aanwezig
        - Nog niet aanwezig, wel gewenst
        - Niet gewenst
      - *Indien gewenst:*
        - Hoe is de ondergrond bij de pijp? (textarea, with optional photo upload slots)
      - Afkoppelen? - radio options: Ja, Nee, Twijfel. *Ja = this pijp no longer drains into the riool.*
      - Waar gaat het water naartoe? (textarea, with optional photo upload slots)
      - Hoe komt het water daarnaartoe? - checkboxes (several can combine, eg a Holie Molie onto an ondergrondse buis), with optional photo upload slots.
        - Holie Molie
        - Drainageslang bovengronds
        - Ondergronds
        - Anders, namelijk: (write-in)
    - Wat gebeurt er bij hoosbuien? (textarea, with optional photo upload slots)
      - *Hint: Kijk en vraag. Waar loopt het dan naar toe? Kan het naar de straat waar een put zit? Of naar een gemeenteplantsoen dat aan de tuin grenst?*
    - Wat wenst de bewoner?
      - Free textarea, with gray hint text above it: *Wat wil de bewoner bereiken? Regenton(nen) plaatsen? Regenpijp afkoppelen? Water de tuin in laten lopen? Wat wil de bewoner zelf doen?*
    - Controle
      - Brief auto text indicating to the klusser if any Bezoek field is missing & still needs filling in (link to scroll up to it if so), or if it's all saved and looks complete.
      - Big green button: "Bezoek afronden"
    - At the bottom: link to the Plan van Aanpak sub-page, so the bezoeker can jot down the voorstel and afspraken while still with the bewoner.
  - **Plan van Aanpak** (sub-page, bezoeker after the bezoek, then admin during review: what we'll do)
    - On the details page, inline: the compact summary (beoordeling and toelichting, voorstel, what the bewoner and De Ulebelt do with their details, materials with an Aantal as "2 × naam à € x" plus the total, werkzaamheden), a "Bewerken" button to the sub-page, and the "Bekijk concept-Plan" link.
    - Link "Bekijk concept-Plan": the Plan van Aanpak as it would look right now, so the bezoeker can check their wording in context. Shown as html, not a literal PDF, because that's faster to render & easier to read on a phone screen. Empty fields are marked there with a `text-warning` "nog niet ingevuld" placeholder; the real PDF just leaves them out.
    - Voorstel Ulebelt
      - Beoordeling (radio); each option produces a standard opening sentence in the PDF:
        - Wensen uitvoerbaar ("De Ulebelt is positief over de wensen van de bewoner en denkt dat ze uitvoerbaar zijn.")
        - Uitvoerbaar met aanpassingen ("De Ulebelt is positief over de wensen van de bewoner en denkt dat ze uitvoerbaar zijn, met de volgende aanpassingen.")
        - Deels uitvoerbaar ("De Ulebelt denkt dat de wensen van de bewoner deels uitvoerbaar zijn.")
        - Niet uitvoerbaar ("De Ulebelt denkt helaas dat de wensen van de bewoner niet uitvoerbaar zijn.")
      - Toelichting (optional textarea), printed after that sentence. Required-ish (`text-warning` nudge) for anything but "Wensen uitvoerbaar".
      - The PDF then prints the fixed line "De Ulebelt stelt de volgende werkzaamheden voor:" before the bullets; it isn't an editable field.
      - Bullet-list of the changes the klusser and bewoner are agreeing to. eg:
        - Zinken regenpijp op maaiveld afzagen en restant daaronder afdoppen.
        - HWA bocht 80 mm 90 graden toevoegen
        - Ca. 3m blinde flexibele buis verbinden aan bocht d.m.v. verloopring 80mm > 50mm
        - Vanaf einde terras ca. 3m geperforeerde buis verbinden aan blinde buis
        - Uit laten monden op gazon
        - Wadi begraven
    - Afspraken (section)
      - Wat gaat de bewoner doen? - checkboxes and then optional textarea for more info:
        - Tuin opruimen op plek regenton
        - Steen van 60x60 regelen voor onder regenton
        - Overleggen met de buren (bij gedeelde regenpijp)
        - Verdere details: <textarea>
      - Wat gaat De Ulebelt doen? - checkboxes and then optional textarea for more info:
        - Plan van Aanpak schrijven
        - Toestemming aan woningcorporatie vragen {only show this if huurwoning}
        - De Klussendienst vragen om afspraak met bewoner te maken
        - Materialen regelen
        - Verdere details: <textarea>
    - Materialen die nodig zijn (table), with the hint "Vul het aantal in bij wat nodig is; laat de rest leeg."
      - Columns: Materiaal, Prijs, Aantal (number input; blank means not needed), Subtotaal. The unit, if any, is part of the Materiaal text (eg "Drainagebuis blind HWA 50 mm, per meter"). On small screens Subtotaal is hidden.
      - The dossier's materials are plain text rows (materiaal, prijs, aantal) belonging to the dossier, not links to the default list: when the dossier is created, the table is prefilled with a copy of the default list (managed on the Materialen page), and from then on every row's Materiaal and Prijs can be edited, and rows deleted, to match what's actually needed on site. Later changes to the default list don't touch existing dossiers.
      - "+ Ander materiaal" adds an empty row.
      - Footer: "Geschatte materiaalkosten: € {totaal}", auto-calculated.
      - Default list (named as in the sample where it has the item; placeholder prices, for the team to correct on the Materialen page):

        | Materiaal | Prijs |
        | --- | --- |
        | Regenton 210 liter | € 45,00 |
        | Regentonstandaard | € 20,00 |
        | Tegel 60x60 (onder regenton) | € 5,00 |
        | Vulautomaat regenton 80 mm | € 15,00 |
        | Vulautomaat regenton 100 mm | € 18,00 |
        | Holie Molie | € 25,00 |
        | HWA eindkap 80 mm | € 2,50 |
        | HWA bocht 80 mm 90° | € 4,50 |
        | HWA bocht 100 mm 90° | € 6,00 |
        | HWA buis 80 mm, per meter | € 5,00 |
        | Regenpijpbeugel 80 mm | € 3,00 |
        | Verloopring 80 > 50 mm | € 3,50 |
        | Drainagebuis blind HWA 50 mm, per meter | € 2,00 |
        | Drainagebuis geperforeerd HWA 50 mm, per meter | € 3,00 |
        | Klikmof 50 mm | € 2,00 |
        | Infiltratiekrat | € 35,00 |
        | Worteldoek, per m² | € 2,50 |
        | Grind 16-32 mm, zak 25 kg | € 6,00 |
        | PVC-lijm, tube | € 8,00 |
    - Werkzaamheden (textarea), with the hint "Welke werkzaamheden horen bij deze materialen? Bijvoorbeeld: aanbrengen van het bovenstaande materiaal." Printed below the materials in section 5 of the PDF.
    - Controle: the same brief auto text as on the Bezoek sub-page, for the Plan van Aanpak fields.
    - Button: "Klaar voor controle" - klusser taps this to send it back into admin's court. A confirmation pop-up says that after this only the beheerders can change the dossier. Until then, Bezoek fields stay editable on the Bezoek sub-page after "Bezoek afronden".
  - **Plan versturen & goedkeuring** (inline, admin)
    - Link "Plan van Aanpak (PDF)", generated live from the current data.
    - PDFs are never stored; the admin CC on every send is the record of exactly what went out.
    - If the corporatie asks for changes: edit the dossier and send the plan again. There's no separate change-request workflow.
    - If the plan changed after a send (`plan_gewijzigd_at` later than that send), that send's green "Verstuurd op {datum}" indication turns `text-warning`: "Verstuurd op {datum}, plan daarna gewijzigd op {datum}", with a link to the audit trail filtered to the changes since. The same applies to the uitvoerder's assignment email, whose attached PDF is then out of date. A link "Opnieuw versturen niet nodig" (with a required note, eg "alleen typfout") accepts the current changes; a later change raises the warning again.
    - "Plan versturen naar bewoner"
      - Button, and a green indication if it's already been sent. The button opens the email preview pop-up, with the PDF attached.
      - It uses a different template if they're a huurder vs eigenaar. If eigenaar, the template should ask the bewoner if they want to use our Klussendienst or if they want to uitvoeren themselves.
    - "Plan versturen naar woningcorporatie" (if huur)
      - Button, and a green indication if it's already been sent. Same pop-up; Aan is prefilled from a per-corporatie address constant in code (pending the team question), and empty for "Anders".
    - (if huur)
      - Green button: "✅ Woningcorporatie heeft het plan goedgekeurd".
      - Red link: "Plan afgewezen: dossier sluiten" (reden Plan afgewezen)
    - (if koop)
      - Green button: "✅ Bewoner kiest voor de Klussendienst"
      - Red link: "Bewoner doet het zelf: dossier sluiten" (reden Bewoner doet het zelf)
  - **Uitvoerder** (inline, admin; shown once the plan is approved to proceed)
    - Dropdown to select a beheerder or klusser to complete the work. Display who the bezoeker was (usually re-use the same person).
    - On selecting someone, opens a pop-up to preview the email we'll send them, with "Ja, versturen" / "Annuleren" as for the bezoeker. The email includes the property address and the link to the dossier, where they can view the contact details and read the Plan van Aanpak (also attached as a PDF).
    - A green "Verstuurd op {datum}" once sent (`text-warning` if the plan changed since; see Plan versturen & goedkeuring), on the dropdown's row with "Opnieuw mailen" at the end, as for the bezoeker.
  - **Uitvoering** (sub-page, uitvoerder)
    - *Once they're assigned & log in, the uitvoerder sees the dossier and can read all its details. They can edit only the uitvoering date, this sub-page and Notities.*
    - On the details page, inline:
      - Link "Plan van Aanpak (PDF)", generated live from the current data.
      - Uitvoering gepland op (date, optional): the uitvoerder enters it after arranging the work with the bewoner by phone.
      - The compact summary (what was done, opleverfoto count, used materials with an Aantal plus the total), and an "Uitvoering invullen" / "Bewerken" button to the sub-page.
    - Wat is er uitgevoerd? (textarea), with the hint "Beschrijf wat er gedaan is en wat er anders ging dan in het plan. Dit komt in het opleverrapport voor de bewoner en de woningcorporatie."
    - Opleverfoto's: a slot where they can upload pictures of the completed work.
    - Gebruikte materialen (table, the basis for invoicing): the same columns as Materialen die nodig zijn, pre-populated with a copy of the planned rows that have an Aantal; each row can be edited or deleted, and "+ Ander materiaal" adds rows.
    - Button: "Werk opgeleverd" - uitvoerder taps this to hand the dossier back to the admin.
  - **Oplevering** (inline, admin)
    - Link "Opleverrapport (PDF)" (disabled until "Werk opgeleverd" is tapped)
    - Link "Materialen met prijzen (voor facturatie)" (same availability): a print-friendly page with the adres, bewoner, woningeigenaar, uitvoerder and opleverdatum, and the Gebruikte materialen with Prijs, Aantal, Subtotaal and Totaal. For a koopwoning it adds a line "Klussendienst: {n} regenpijpen × € 50,00" with its subtotal before the Totaal, which includes it; n counts every regenpijp on the kaart, and the € 50 is a constant in code (both pending the team question). Printed or saved as PDF from the browser; it's for the administratie, never sent from the app.
    - "Opleverrapport versturen naar woningcorporatie" (if huur)
      - Only available once "Werk opgeleverd" is tapped.
      - Button opens a pop-up to preview the email to be sent to the woningcorporatie, with the opleverrapport PDF attached. Green text indicating if it was already sent.
    - "Opleverrapport versturen naar bewoner"
      - Same availability and pop-up preview as above, with a bewoner template. Green text indicating if it was already sent.
    - Big green button "✅ Uitgevoerd: dossier sluiten" (closes the dossier with reden "Uitgevoerd"). If an opleverrapport hasn't been sent yet, it first asks "Het opleverrapport is nog niet verstuurd. Toch sluiten?", since a closed dossier can't send.
- Plan van Aanpak PDF format
  - Contains everything filled in on the form, in roughly the same narrative sequence, following the structure of the sample (Voorbeeldstraat 12):
  - **Header block**: Locatie, Bewoner, Woningeigenaar, Datum schouw (afspraak date), Schouw door (the bezoeker), Auteur (the admin who created the dossier).
  - **1. Regenwatervolume**
    - Algemeen: woningtype, huur/koop & woningeigenaar, straatfoto.
    - Dakoppervlakte en waterberging: the kadasterkaart with its tekeningen, and the "Dak" (dakdelen) table with its two footnotes.
  - **2. Infiltratie**: "Tuin" (tuindelen) table, verhard %, tuinsituatie text, wat gebeurt er bij hoosbuien, tuin photos.
  - **3. Bodemgegevens**: the bodemsituatie choice, with the boorlocatie and bron (BRO/DINOloket); boorprofiel image in the bijlage.
  - **4. Plan van aanpak**
    - Regenpijpen: one compact row per pijp (letter, dakdeel, soort, diameter, regenton, afkoppelen, waar & hoe het water naartoe gaat).
    - Wensen van de bewoner.
    - Voorstel Ulebelt: the Beoordeling sentence, Toelichting, fixed lead-in line, werkzaamheden bullets.
    - Afspraken: wat gaat de bewoner doen, wat gaat De Ulebelt doen.
  - **5. Materialenlijst en uitvoering**: the rows with an Aantal, listing Materiaal and Aantal only, then the Werkzaamheden text. Prices are left out, as in the sample (see team question).
  - **Bijlage**: boorprofiel image and the standard "Doorlaatbaarheid per grondsoort" table, rendered as text from a constant in code (transcribed from the sample):

    | Grondsoort | Doorlaatbaarheid |
    | --- | --- |
    | Klei | Slecht |
    | Zavel (zand en klei) | Slecht |
    | Veen | Slecht |
    | Zandig leem | Matig |
    | Sterk zandig veen | Zeer slecht |
    | Leem/ Löss | Zeer slecht |
    | Lichte zavel | Matig |
    | (Zeer) grof zand | Zeer goed |
    | (Duin)zand | Zeer goed |
    | Middelfijn (duin)zand | Goed |
    | Zeer fijn (duin)zand | Matig |
    | Fijn en grof grind | Zeer goed |
    | Schelpen | Zeer goed |
  - The completion report (opleverrapport) uses the same header, plus an Uitvoering section: description of the work, opleverfoto's, and Gebruikte materialen (Materiaal and Aantal only, like the plan).
- Statussen page
  - Linked from the "?" next to Volgende stap. Lists every status in order with its rule, generated from the same rule list the app uses, so docs and behavior can't drift apart.
  - Columns #, Status (bold), Ligt bij (a label colored by role, as everywhere the app shows who the ball lies with), Huidig zolang.
  - The status is never set by hand; it's derived from the dossier's data. The first step whose rule matches is the current one:

    | \# | Ligt bij | Status | Current while |
    | --- | --- | --- | --- |
    | 1 | Beheerder | Intake | "Intake is compleet" not yet tapped |
    | 2 | Beheerder | Bezoeker toewijzen | No bezoeker assigned |
    | 3 | Klusser | Bezoek plannen | No afspraak date |
    | 4 | Klusser | Bezoek uitvoeren | "Bezoek afronden" not yet tapped |
    | 5 | Klusser | Plan van Aanpak afronden | "Klaar voor controle" not yet tapped |
    | 6 | Beheerder | Plan controleren & versturen | Plan not yet sent (to the corporatie if huur, to the bewoner if koop) |
    | 7 | Woningcorporatie | Plan goedkeuren (huur) | Corporatie approval not yet recorded |
    | 8 | Bewoner | Klussendienst of zelf? (koop) | Bewoner's choice not yet recorded |
    | 9 | Beheerder | Uitvoerder toewijzen | No uitvoerder assigned |
    | 10 | Klusser | Werk uitvoeren | "Werk opgeleverd" not yet tapped |
    | 11 | Beheerder | Opleverrapport versturen | Not yet closed as Uitgevoerd |
  - Closing is separate from these steps: a closed dossier stores when, by whom and the reden (Uitgevoerd, Niet subsidiabel, Plan afgewezen, Bewoner doet het zelf, Bewoner afgehaakt, Anders), and shows "Gesloten" instead of a step. Reopening clears that, and the step is derived again from the data.
  - Each step's milestone is stored as a timestamp + who (eg `bezoek_afgerond_at/_by`), never as a boolean; the aandacht rules depend on those timestamps.
- Aandacht-criteria page (admins only)
  - Linked from the Beheer dropdown and from each dossier's aandacht banner. Like the Statussen page, generated from the same rules and threshold constants the app uses.
  - A dossier needs aandacht if it has any finding of the three kinds below. Each finding is one bullet in the dossier's aandacht banner (linking to the field or section to fix), and the dossier gets the red "aandacht" badge in lists and counts. Findings are computed from the data on every page load, just like the status, never cached; nothing is stored except snoozes and "Opnieuw versturen niet nodig" notes. The Overzicht and stats counts and the weekly digest cover open dossiers; the dossier page and the list's Aandacht filter cover closed ones too.
  - **Klopt niet** (admins only). Listed first in the banner, under the headline "De gegevens spreken elkaar tegen. Controleer:" followed by a question-circle icon linking to this page. Checked on open and closed dossiers; cannot be snoozed.

    | Rule | Banner line |
    | --- | --- |
    | A later step's milestone is set but an earlier applicable step's isn't (one generic check over the status table) | "Stap {nr} ({latere stap}) is gedaan, maar stap {nr} ({eerdere stap}) nog niet." |
    | Koopwoning with a corporatie approval recorded | "Koopwoning, maar met goedkeuring van de woningcorporatie. Klopt huur/koop?" |
    | Huurwoning with a bewoner Klussendienst choice recorded | "Huurwoning, maar met een keuze voor Klussendienst of zelf. Klopt huur/koop?" |
    | Rioolstelsel gescheiden, dossier open and past Intake | "Riool gescheiden, maar het dossier loopt nog. Sluiten, of riool corrigeren?" |
    | Closed as Niet subsidiabel while rioolstelsel is gemengd | "Gesloten als niet subsidiabel, maar het riool is gemengd." |
    | Bezoek afgerond while the afspraak is in the future | "Bezoek afgerond, maar de afspraak is pas op {datum}." |
    | Werk opgeleverd while uitvoering gepland is in the future | "Werk opgeleverd, maar de uitvoering is pas gepland op {datum}." |
    | The bezoeker/uitvoerder of an open step is archived | "{naam} is gearchiveerd, maar nog {bezoeker/uitvoerder}. Wijs iemand anders toe." |

    States the UI cannot produce (eg a regenpijp linked to a non-existent dakdeel) aren't banners: they're bugs, so the code raises an error.
  - **Ligt stil**. Only for open dossiers, only for the current step. The clock starts when the step began (the timestamp of the previous step's milestone; `created_at` for Intake), except for the two scheduled steps, which run from their planned date.

    | Step | Aandacht when | Banner line |
    | --- | --- | --- |
    | 1 Intake | \> 3 days since created | "Intake al {n} dagen open. Nog niet ingevuld: {ontbrekende velden}." (or "Nog niet als compleet gemarkeerd." when nothing is missing) |
    | 2 Bezoeker toewijzen | \> 7 days since the intake was marked compleet | "Al {n} dagen geen bezoeker. Nieuwe oproep in de Signal-groep?" |
    | 3 Bezoek plannen | \> 7 days since bezoeker assigned | "{bezoeker} heeft na {n} dagen nog geen afspraak gepland." |
    | 4 Bezoek uitvoeren | \> 2 days after the afspraak; never while the afspraak is in the future | "Afspraak was op {datum}, maar het bezoek is niet afgerond. Doorgegaan?" |
    | 5 Plan van Aanpak afronden | \> 5 days since bezoek afgerond | "Bezoek was {n} dagen geleden; plan nog niet klaar voor controle." |
    | 6 Plan controleren & versturen | \> 5 days since ready for review | "Plan wacht al {n} dagen op controle." |
    | 7 Plan goedkeuren (huur) | \> 14 days since the latest send to the corporatie | "{corporatie} reageert al {n} dagen niet op het plan. Nabellen?" |
    | 8 Klussendienst of zelf? (koop) | \> 14 days since the latest send to the bewoner | "Bewoner kiest al {n} dagen niet tussen Klussendienst of zelf. Nabellen?" |
    | 9 Uitvoerder toewijzen | \> 7 days since approval/choice | "Plan al {n} dagen goedgekeurd, nog geen uitvoerder." |
    | 10 Werk uitvoeren | \> 3 days after uitvoering gepland; if no date, > 21 days since uitvoerder assigned; never while the planned date is in the future | "Uitvoering was gepland op {datum}, maar niet opgeleverd." / "{uitvoerder} heeft na {n} dagen nog geen uitvoering gepland." |
    | 11 Opleverrapport versturen | \> 7 days since werk opgeleverd | "Werk al {n} dagen opgeleverd. Rapport versturen en dossier sluiten?" |
    - Thresholds are constants in code, shown in this table.
    - Admins can snooze a Ligt stil finding ("Aandacht uitstellen" in the dossier menu) until a date, with a required note. While snoozed it shows as a small gray line "Uitgesteld tot {datum}: {notitie}" and doesn't count as aandacht. A snooze ends at its date or when the step changes.
    - Klussers see Ligt stil findings only for their own steps (3, 4, 5, 10), as a reminder, without the aandacht badge.
  - **Plan gewijzigd** (admins only). For open dossiers: `plan_gewijzigd_at` is later than a plan send to the bewoner or corporatie, or than the uitvoerder's assignment email, and later than the last "Opnieuw versturen niet nodig". One line per affected recipient: "Plan gewijzigd op {datum}, na versturen naar {ontvanger}. Opnieuw sturen?" Cleared by resending to that recipient or by "Opnieuw versturen niet nodig"; cannot be snoozed.
- "Gebruikers" list (admins only)
  - Linked in the navbar.
  - Button, top right: "+ Nieuwe gebruiker". Opens a form: Naam, E-mail, Telefoon (optional), Rol (Beheerder or Klusser). An e-mail address that already exists shows an error naming that user. The new user logs in the usual way with their e-mail address; nothing is sent automatically.
  - Telefoon is for the team's own reference: shown only to admins, never in the Plan van Aanpak, the opleverrapport, or emails to bewoners and woningcorporaties.
  - Checkbox "Toon gearchiveerde gebruikers" (default off).
  - Table of users, beheerders first. Columns: Naam, E-mail, Telefoon, Rol, Laatst actief (date of their most recent request to the app), Open dossiers, Gesloten dossiers (counting the dossiers where they're bezoeker or uitvoerder). Click a row to open the user's page.
- Gebruiker page (admins only)
  - Breadcrumb back to Gebruikers.
  - Title: the user's name, with a Beheerder/Klusser badge, and a gray "Gearchiveerd" badge if archived.
  - Gegevens: Naam, E-mail, Telefoon, Rol, Aangemaakt op, Laatst actief.
  - Dossiers: the dossiers where they're bezoeker or uitvoerder, open first, then closed. Columns: Adres, Rol (Bezoeker, Uitvoerder or "Bezoeker + Uitvoerder"), Status, Laatste activiteit.
  - Link "Alle activiteit van {naam}": the Alle activiteit page filtered to this user.
  - Actions dropdown in the top right corner: "Bewerken", "Archiveren" (or "Dearchiveren" if archived), "Inloggen als {naam}".
    - "Bewerken" opens the "+ Nieuwe gebruiker" form, filled in.
    - "Archiveren" opens a confirmation pop-up explaining what it does: they're logged out everywhere at once, can no longer log in, and are hidden from the bezoeker/uitvoerder dropdowns, but stay named on the dossiers they worked on. Open dossiers still assigned to them get a Klopt niet finding until reassigned. "Dearchiveren" restores access.
    - "Inloggen als" first asks for confirmation, warning that it's meant for troubleshooting and that actions are recorded as yours on their behalf. It then shows the app as that klusser sees it, with exactly their permissions (the server checks every request as them), and a red banner below the navbar: "Je bekijkt de app als {naam}. {Terug naar {mijn naam}}". Offered only for active klussers: another admin's view is the same as your own.
      - Everything done meanwhile is attributed to the admin: audit entries name the admin as actor plus the klusser being viewed (shown as "{admin} (als {klusser})"), milestones store the admin as `_by`, and no melding is sent, as when an admin acts themselves. The klusser's Laatst actief doesn't change.
      - Starting and stopping are audit events. It ends on "Terug naar {mijn naam}", on Uitloggen, when the admin's session expires, or when the klusser is archived (the next request returns the admin to their own view).
    - Admins can't archive themselves or change their own role, so they can't lock themselves out.
- "Beheer" (navbar dropdown of further less-used links, all of these links & pages are admin-only)
  - "Materialen"
    - Lets admins manage the default list of materials (Materiaal, Prijs) and its order, set by dragging a row by its grip (or arrow keys on the grip). It's only the prefill for new dossiers' Materialen tables (see Plan van Aanpak).
  - "E-mailsjablonen"
    - The templates: Subsidie: subsidiabel, huurwoning / subsidiabel, koopwoning / niet subsidiabel; Bezoeker toegewezen; Plan naar bewoner (huur); Plan naar bewoner (koop, asks Klussendienst of zelf); Plan naar woningcorporatie; Uitvoerder toegewezen; Opleverrapport naar woningcorporatie; Opleverrapport naar bewoner; Oproep Signal-groep (copied to the clipboard, no onderwerp). The login email is fixed in code.
    - Seeded at launch from the prototype's drafts, with texts written for the ones it lacks; admins edit them from then on.
    - Lists the templates as buttons (three columns on desktop, stacked on phones), each opening the template's own edit page with a breadcrumb back to the list. Each one has {...} tags, listed at the top so you know what tags are supported (required ones marked), and validated on save with warnings for unknown tags (eg a typo `{adress}`) and missing required tags (eg `{link}` in a klusser email).
  - "Leeg bezoekformulier (PDF)" (see Bezoek)
  - "Alle activiteit"
    - An audit list of all recent changes in the app, most recent at top, cursor-paginated. With date/time, who, what dossier (link), summary of the change.
    - All sent emails are also recorded in the audit trail.
    - Audit events are filterable by actor (user), event type, dossier ID. (Each audit event has a type, which can be eg dossier created, dossier updated, user created, user archived, email sent, etc. A payload json field specifies the details, eg for each email sent it specifies the subject & recipient.)
  - "Uitleg: statussen" (link to the Statussen page)
  - "Uitleg: aandacht" (link to the Aandacht-criteria page)
- Account (navbar dropdown at the right, labeled with the user's naam; everyone)
  - "App op je telefoon zetten" (the install-guide page)
  - "Uitloggen"
- Install-guide page ("App op je telefoon zetten")
  - Where the browser offers its own install prompt (Chrome and Edge on Android, via `beforeinstallprompt`), a big "Installeren" button on top opens it; the steps below stay as a fallback. iOS Safari has no such prompt, so there the steps are all there is. Opened from the installed app itself, the page just says "De app staat al op je telefoon."
  - Short steps with a screenshot each, the detected platform's steps first and the other platform's collapsed below.
  - iPhone (Safari): open this page in Safari itself, not in the mail app's built-in browser; tap the Deel button; "Zet op beginscherm"; "Voeg toe".
  - Android (Chrome): tap the ⋮ menu; "App installeren" (or "Toevoegen aan startscherm").
  - Then: open the app from the new icon and log in once more with your e-mail and code. *The home-screen app keeps its own login, separate from the browser's.*
  - On a desktop browser: a big amber banner on top, "Open deze pagina op je telefoon", without hiding the steps.
- Meldingen aan beheerders (automatic emails, no page)
  - The app's only automatic emails. They go to one alert address (a constant in code, pending the team question), never to bewoners, corporaties or klussers, and change nothing in the data; they're logged in Alle activiteit. Each links to the dossier.
  - Immediately, when a klusser hands the ball back to the admins:
    - "Klaar voor controle" tapped: "Plan van Aanpak klaar voor controle: {adres} ({klusser})".
    - "Werk opgeleverd" tapped: "Werk opgeleverd: {adres} ({klusser})".
    - Not when an admin does it themselves (eg typing up a paper visit), and not for "Bezoek afronden": the ball stays with the klusser until "Klaar voor controle".
  - Weekly, Monday at 08:00: "Aandacht nodig: {n} dossiers", listing every open dossier with a non-snoozed finding, grouped Klopt niet / Plan gewijzigd / Ligt stil, each with its banner line. A dossier with no activity in the past 7 days also gets "geen activiteit sinds {datum}". Not sent if the list is empty. *A weekly digest rather than one email per dossier, because at hundreds of open dossiers per-dossier mails would get filtered and ignored.*
  - Immediately, when an outbound email fails to send: "E-mail niet afgeleverd: {onderwerp} aan {adres}". The send is then shown in red on the dossier ("Niet afgeleverd op {datum}") and doesn't count as sent. *(At launch this covers only a rejection by the provider at send time. Bounces after sending are detected from a later milestone, via the Mailgun webhook.)*
  - Server errors, PDF render failures and failed backups go to the maintainer, not to this address.

## Footer & other UI

- Footer needs a couple links:
  - Data privacy (page that details the privacy policy, data handling, subprocessors, and other GDPR requirements; placeholder text until the data controller question is settled)
  - Give Feedback
    - opens a pop-up where you can fill in feedback similar to what the prototype had. Admin and dev (me) are notified via email on each feedback. Admin nav dropdown has a "Feedback" page that lists all feedback; each can be marked as "Handled" to hide it from the default list (toggle at the top to show all vs default of showing just unhandled)

## Scenario tests

Each scenario is an end-to-end test that walks one dossier through the app and, after each action, asserts the derived status, the aandacht findings, and key PDF fields:

1. Huur happy path: intake, bezoek, plan (materials prefilled from the default list, some Aantallen filled in), corporatie approves, uitvoering (Gebruikte materialen prefilled from the planned rows), opleverrapport to corporatie and bewoner, closed as Uitgevoerd.
2. Koop with Klussendienst, uitvoerder different from the bezoeker and created on the spot via "+ Nieuwe klusser"; the uitvoerder's list shows a filled Uitvoering badge, the bezoeker's shows "✓ Bezoek" in muted text. After "Klaar voor controle" the bezoeker can no longer edit, nor the uitvoerder after "Werk opgeleverd". After closing as Uitgevoerd, the admin resends the opleverrapport to the bewoner.
3. Koop, bewoner does it themselves: closed as Bewoner doet het zelf.
4. Niet subsidiabel: gescheiden riool, closed at intake.
5. Corporatie asks for changes: plan edited (Plan gewijzigd finding appears, the audit trail shows old and new values), resent (finding clears, the step 7 clock restarts), then approved.
6. Corporatie rejects: closed as Plan afgewezen.
7. Bewoner drops out after the bezoek: closed as Bewoner afgehaakt (no field can be edited while closed), reopened later, status resumes at the right step.
8. Paper visit on a generic "Leeg bezoekformulier": the admin assigns the klusser who did it as bezoeker (without notifying them) and types it up; the PDF shows that klusser as Schouw door and the admin who created the dossier as Auteur. The admin emails that PDF outside the app and records it with "Handmatig verstuurd"; the status moves on as for a normal send.

Aandacht edge cases inside these: an afspraak in the future raises no flag, the same afspraak 3 days past does; switching huur to koop after a corporatie approval raises the Klopt niet finding; a snooze hides a Ligt stil finding until its date.

## Technical features we need to account for

- Stack, testing, devops and build order: see `architecture.md`.

## Wishlist ideas for later

- Automatically look up 
- UI things I'm uncertain about:
  - Maybe the bezoeker's post-onsite fields should be part of the same sub-form, for simplicity/clarity? With a clear "To fill in after the bezoek" heading.
- Automatically grab a Street View photo to save admin the 10 seconds of screenshotting it.
- Rioolkaart: can we pass it an address or coordinates? Riool autodetectie for more gemeenten (Voorst publishes its pipes in PDOK's GWSW dataset; Zutphen unknown).
- boormonsterprofiel (DINOloket): It should be possible to automate the process for locating the nearest sample and grabbing its SVG. Troubleshoot with Claude why it couldn't do this.
- Stale-edit warning: when you save a field that someone else changed since you opened the page, show their value and ask which to keep (until then the last save wins).
- Named dakdelen (eg "Dakdeel linksachter", as in the sample Plan van Aanpak) instead of only D1, D2.
- One regenpijp draining two dakdelen: check with the team whether that occurs, and if so let a regenpijp link to several dakdelen.
- Open-source the code (pending the team question): a "Broncode op GitHub" link in the footer. Before the repo goes public, scrub it of sensitive content, git history included; everything in `tmp/reference/` counts as sensitive.
- Integrations mentioned at the kickoff: Gebruikte materialen to voorraadbeheer and to invoicing (factuur to the client), and reports for the opdrachtgevers/funders beyond the CSV export.
- *Idea to feel out with the team*: AI sanity-check that reviews all details in a record kloppen / make sense, and flag any issues before allowing handoff to the next step. So we catch any calculation errors before handing off to the bezoeker, and the bezoeker likewise can get a realtime flag on any possibly mis-entered data before they finish the on-site. (privacy-preserving, OpenRouter ZDR)
