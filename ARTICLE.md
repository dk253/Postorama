# I Had an Idea Last Night. This Morning I Had a Working App. I Have 40 Years of Experience and I've Never Seen Anything Like This.

Last night I had an idea. I wanted to send my family real physical postcards — the kind that arrive in the mailbox — automatically, from my own Photos library, on a schedule. One per person, rotating through their album, with a personal message, their address pulled from Contacts.app, printed and mailed through the Lob API. Completely hands-free after setup.

This morning, that app exists. It's running in my menu bar. It's already sent postcards.

The app is called Postorama. The source code is on GitHub at [https://github.com/dk253/Postorama](https://github.com/dk253/Postorama). And here's the part I want you to sit with for a moment: I built it with Claude in a couple of hours.

I've been writing software since the early 1980s. I've lived through the PC revolution, the internet, mobile, cloud, open source, agile. Every decade brought something that changed how we work. I've adapted every time.

Nothing has changed the game like this.

---

## What 40 Years Gives You

My experience didn't become irrelevant — it became the engine.

Because I've built systems like this before, I could write a specification precise enough for Claude to execute correctly on the first pass. I knew this would need an Electron shell, a SQLite database with a migration strategy, native module compilation against the Electron runtime, JXA to talk to Photos.app, a Swift subprocess for CNContactStore, a React frontend with typed IPC channels, a scheduler, encrypted API key storage via safeStorage. The entire architecture was clear in my head before I wrote a word.

That specification became the opening prompt. If you want to see exactly how I started — the full document I handed to Claude — it's included in the repository as `MENUBAR_APP_PROMPT.md`. That file is the seed the entire application grew from.

Forty files. A full working application. On the first pass.

The app organizes everything through two folders in Photos.app: a `Postorama` folder where you create one album per recipient named after them, and a `Postorama Sent` folder the app manages automatically. Clean, obvious, no cryptic naming conventions. I knew what I wanted the UX to feel like before I asked for it — and that clarity translated directly into the result.

When things needed fixing — the macOS notification showing "Electron" instead of the app name, an album being created as "Untitled Album" due to a subtle JXA quirk, a UI overlay swallowing click events because of an Electron drag region, a contact whose city and zip were typed as a single block in the street field causing the mailing API to reject it — I knew what I was looking at. I could diagnose the category of problem immediately and describe it in terms Claude could act on.

Deep experience didn't go away. It compressed. All those years of hard-won knowledge — it's still doing the work. It's just doing it through a different interface.

---

## The Speed Is Disorienting

I want to be honest about what it actually feels like, because productivity numbers don't capture it.

It's not just that things get done faster. It's that the feedback loop is different. Describe a problem precisely — a fix arrives in seconds. Think through a new feature, describe it clearly — working code to evaluate immediately. The bottleneck has moved. It's no longer "how fast can I write this." It's "how clearly can I think about this."

That shift changes how you work. I find myself spending more time thinking carefully about what I actually want before I ask for it. The clarity of the request determines the quality of the result. The fundamentals of good engineering — understanding the problem before touching the keyboard — matter more now, not less.

---

## What Has Changed and What Hasn't

Some things are exactly the same as they've always been.

You still need to understand what you're building. You still need to know when something is wrong. You still need to make architectural decisions and understand why one approach is better than another. You still need to read the code that comes back and judge it. Forty years of judgment doesn't disappear — it runs the whole time, in the background, every step of the way.

What has changed is the execution layer. The translation from clear thought to working code is now nearly instant. For most of my career, execution took most of the time. Design was fast. Debugging was fast. But sitting down and writing the code — that was where the hours went.

That bottleneck is gone.

---

Postorama has now sent real postcards to people I love. Photos from my library, personal notes, their addresses, real physical mail. My mom called after she got the first one. She just thought I was being thoughtful.

I had the idea last night.

I've been in this industry long enough to know when something is a trend and when something is a shift. This is a shift. The productivity ceiling I've been working under for 40 years just moved. I don't know yet where the new ceiling is.

I'm going to find out.

---

*Source code and the original prompt that started it all: [github.com/dk253/Postorama](https://github.com/dk253/Postorama)*
