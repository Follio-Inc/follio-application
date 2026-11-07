# Follio for iOS and Android

Starting brief for the engineers who will create the Follio phone app. The app does not exist yet. This document explains the product, the stack, and the system. It is not a screen-by-screen spec and it is not a map of the website codebase.

## The product

Follio is a professional identity you can share.

Someone captures who they are once. Follio turns that into a single link. The person who opens the link meets them: how to reach them, their resume, and selected work. Those are views of one profile, not separate documents that drift apart.

```
Capture  →  Curate  →  Share one Follio
```

The website already does this. The phone app will too. It should carry most of what Follio does today: account, first-time setup, the profile itself, more than one resume, bringing data in, editing, visibility, sharing, and seeing the result the way a recipient will see it.

The center of the app is sharing that identity. Building and editing exist so the link is worth sending. A person should be able to live in Follio from their phone, then hand someone a link that opens the real Follio.

The public page stays on the web. Recipients are not asked to install an app to meet someone. The phone app is how the owner carries, prepares, and shares that page.

Internal tools, such as the admin area, stay on the website.

## Stack

One codebase, two stores. iOS and Android are the same app.

|          | Choice                                               | Why                                                                                                              |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| App      | Expo, on React Native                                | One TypeScript project produces both the App Store and Play Store builds. The interface is native to each phone. |
| Language | TypeScript and React                                 | Same language as the website, so the team is not splitting across Dart or Swift and Kotlin.                      |
| Sign-in  | Clerk, the same project as the website               | One account on the web and on the phone.                                                                         |
| Backend  | The existing Follio website                          | The app is a client. Profiles, imports, AI, public pages, and PDF stay where they are.                           |
| Data     | The website’s database, reached only through its API | The phone does not connect to Postgres and does not keep its own copy of the profile.                            |
| Repo     | A new GitHub repository                              | Suggested name: `follio-mobile`. This website repository is not the app.                                         |

### What those names mean

**React Native** is a way to build mobile apps in React. A screen is real iOS and Android interface, not a website inside a frame.

**Expo** is the toolchain around React Native. It creates the project, runs it on simulators and devices, and builds the binaries that go to the stores. It also covers the device capabilities this product will want, especially the system share sheet, camera and files for a resume upload, and secure storage for the session.

**Flutter** was considered and set aside. It is a strong toolkit, and it would mean writing the app in Dart, a language this product does not use anywhere else. The phone screens will be new either way, so a second language does not buy a shared interface with the website.

### What we are not doing

We are not putting the app inside this repository, and we are not trying to run the website’s screens on a phone. The website is Next.js, built for the browser. Its components do not run in React Native. Shipping both from one repo would also tie a website deploy to an app-store release, and those move on different schedules.

A monorepo can happen later if we want one place for shared types. It is optional, and it is not the starting move. Until then, the contract between the two is the HTTP API.

## System design

The website is already the system of record. The app joins it as another client.

```
                         ┌─────────────────────────────┐
                         │  Follio website             │
                         │                             │
   Owner                 │  Accounts and sessions      │
   ┌──────────────┐      │  Profile API                │
   │  Phone app   │─────►│  Import and AI              │
   │  iOS/Android │ JSON │  Public Follio, resume, work│
   └──────────────┘      │  PDF                        │
                         │           │                 │
                         │           ▼                 │
                         │        Database             │
                         └───────────┬─────────────────┘
                                     │
                          the Follio link
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  Recipient      │
                            │  in a browser   │
                            └─────────────────┘
```

Anyone with a Follio account can use either client. A save on the phone is the profile. The website, the public page, and the resume all read it. There is no sync product and no mobile-only profile.

### Identity

A person has an account. Under that account they can have more than one resume. Each resume is a profile. One profile is their Follio: the identity behind the link they share.

The server decides which profile a request applies to. The app sends the session and, when the person switches resumes, asks the server to switch. It does not invent its own notion of “current user” or “current resume.”

### Sign-in

The app signs in through Clerk, against the same Clerk application the website uses. The session on the phone and the session in the browser are independent. They are the same person.

Owner requests carry that session. The server identifies the caller. The app stores no database credentials and no server secrets. It needs the public Clerk key and the address of the API.

The website today trusts sessions that come from its own site. The first thing to prove on a device is that a phone session is accepted. Build that path before building features on top of it.

### Sharing professional identity

This is the heart of the app.

The owner prepares a Follio, then sends one link. The recipient opens it in a browser and lands on the public page: contact, with the resume and work one step away. The app’s share action uses the system share sheet, so the link can go to Messages, Mail, WhatsApp, or anywhere else the phone already shares.

The server owns the link. The app asks for it. It does not construct a production URL itself.

What can be shared:

|                 | Recipient opens                                                 |
| --------------- | --------------------------------------------------------------- |
| Follio          | `https://handle.follio.me`                                      |
| Public resume   | `https://follio.me/username`                                    |
| Unlisted resume | `https://follio.me/r/…`, with the username left out of the path |
| Work            | the Follio host, at `/work`                                     |

Visibility is part of the product. A Follio can be public, private, or still a draft. A resume or the work page can be public, unlisted, or private. An unlisted resume link is opaque so it cannot be turned back into the public username. The app must present those states honestly. Sharing a private identity as though it were public is a product bug.

Share tokens and unlisted keys, when the owner uses them, are issued by the server.

### Where work happens

| Concern                                          | Lives                                             |
| ------------------------------------------------ | ------------------------------------------------- |
| Account, profile, visibility, share links        | Server. The app reads and updates them.           |
| Importing a resume, GitHub, LinkedIn, AI rewrite | Server. The app starts them and shows the result. |
| Public page, resume layout, PDF                  | Server. The app shows what the server rendered.   |
| Screens, navigation, phone-native sharing        | The app.                                          |

Resume templates are not redrawn in React Native. When the owner wants to see the page someone else will see, the app shows the server’s page or the PDF.

Some website screens load their data while rendering HTML, and have no JSON endpoint yet. If the app needs that data, add the endpoint to the website. Do not query the database from the phone, and do not reimplement the rule in the client.

Bullets and summaries can contain formatting stored as HTML. The app has to round-trip that formatting. A plain text save that wipes bold and links is data loss.

### The website, as a reference

Use the running website to learn what Follio does: what a flow asks for, what it saves, what it refuses, and how the public page looks. Recreate that behavior in native screens.

Do not copy the website’s components, styles, or server code into the app. Take the brand from the product itself — the mark, the indigo accent, the quiet surfaces — and make a phone interface that feels like Follio.

If the app needs a new fact stored on the person or the profile, add it on the website first so both clients agree.

## What the app covers

Most of the owner-facing product. Grouped by what they are for, not by the website’s navigation.

**The identity people receive.**
The Follio itself: name, photo, headline, how to reach you, and the link. This is the home of the app. Opening Follio on the phone should answer “what will someone see, and how do I send it?”

**The material behind that identity.**
The sections a Follio is built from: summary, experience, education, skills, projects, and the other sections the website already supports. Editing on the phone writes the same profile the website edits. Layout can be designed for a phone. The data cannot be a subset that surprises someone who also uses the web.

**Capture.**
Getting material in: a resume file, GitHub, LinkedIn, and editing by hand. Imports are inputs. The person reviews them before they become the profile. Nothing already curated is overwritten in silence.

**More than one resume.**
A person can keep several resumes and choose which one is the Follio they share. Creating, switching, and telling them apart belongs in the app.

**Seeing it.**
Preview of the public Follio, the resume, and work, plus downloading the PDF. These are the server’s renderings, shown on the phone.

**The account.**
Sign-in, sign-out, and the settings a person needs in order to trust the app with their identity.

Design each of these for a phone. A desktop editor with many panes is not the layout to reproduce. The capability is what has to come across.

## How to start

1. Create the Expo app in a new repository. Run it on a simulator and on one physical phone.
2. Sign in with a real Follio account and load that person’s profile through the API. Do not proceed on a mocked identity.
3. Build outward from sharing the professional identity: the link, its visibility, and the system share sheet.
4. Fill in the rest of the owner product against the website, area by area, using the groups above. When a flow has no API, add one to this repository and then call it.
5. Keep iOS and Android on the same codebase the whole way. Differences belong in platform details, not in a second app.

Both store builds come from that one Expo project.
