# Personal Portfolio — Rajendra Aria Nismara

**A responsive personal portfolio built with HTML, CSS, and Vanilla JavaScript.**

A personal website designed to showcase my background, technical skills, professional experiences, and selected projects through a clean, interactive, and accessible interface.

The project emphasizes lightweight frontend development, responsive design, reusable interaction patterns, and practical integration with external services — without relying on a frontend framework or build system.

**HTML5** · **CSS3** · **Vanilla JavaScript** · **Supabase** · **Responsive Design**

[Live Website](YOUR_LIVE_WEBSITE_URL) · [Explore Projects](YOUR_LIVE_WEBSITE_URL) · [LinkedIn](YOUR_LINKEDIN_URL)

> Replace the placeholder links above with your actual URLs before publishing.

---

## ✨ Project Overview

This portfolio serves as my personal digital space to introduce myself, document my development journey, and present projects beyond screenshots.

Rather than using a prebuilt website template or frontend framework, I developed the website using core web technologies to strengthen my understanding of page structure, responsive styling, DOM manipulation, and interactive browser behavior.

The portfolio combines a single-page homepage with standalone project detail pages, making it easy for visitors to explore both my professional background and technical work.

### Project Highlights

- **Framework-free frontend:** Developed using HTML, CSS, and Vanilla JavaScript without a frontend framework or bundler.
- **Responsive interface:** Layouts and image variants designed for different screen sizes.
- **Interactive experience:** Navigation, sliders, image carousels, and scroll-reveal interactions.
- **Project case studies:** Dedicated pages for presenting individual projects in greater detail.
- **Live guestbook:** A Supabase-backed guestbook for visitor comments.
- **Optimized media:** Mobile-specific WebP images generated through development utilities.

---

## 🖥️ Website Preview

### Homepage

![Portfolio Homepage](YOUR_HOMEPAGE_SCREENSHOT_PATH)

*The main portfolio interface highlighting my profile, navigation, and featured sections.*

### Projects & Case Studies

![Project Showcase](YOUR_PROJECT_SCREENSHOT_PATH)

*Selected projects and dedicated detail pages presenting technical work.*

### Responsive Experience

![Responsive Preview](YOUR_RESPONSIVE_SCREENSHOT_PATH)

*Layouts optimized for desktop and mobile viewing.*

> The screenshots above are placeholders. Replace them with actual screenshots from the deployed website.

---

## 🚀 Features

| Feature | Description |
|---|---|
| Personal Introduction | Hero section introducing my profile and professional focus. |
| About & Tech Stack | Background information, organizational/activity photo carousel, and technology grid. |
| Experience & Education | Sections documenting professional experience and educational background. |
| Project Showcase | Portfolio section linking to standalone project detail pages. |
| Interactive UI | Navigation interactions, sliders, and scroll-reveal effects implemented with JavaScript. |
| Live Guestbook | Visitor comment interface connected to Supabase. |
| Responsive Images | Mobile-optimized WebP variants served through HTML `<picture>` elements. |
| Contact Section | Contact information and visitor interaction area. |

---

## 🛠️ Technology Stack

### Core Frontend

| Technology | Usage |
|---|---|
| HTML5 | Semantic page structure and content organization. |
| CSS3 | Layouts, responsive styling, transitions, and visual design. |
| Vanilla JavaScript | DOM interactions, navigation, sliders, and dynamic UI behavior. |

### External Services & Libraries

| Technology | Usage |
|---|---|
| Supabase | Guestbook data storage and comment submission workflow. |
| Google Fonts | Web typography. |
| Devicon | Technology and development-related icons. |
| Iconify | Interface and icon rendering. |

### Development Utilities

| Technology | Usage |
|---|---|
| Node.js + Sharp | Manifest-driven generation of mobile WebP images. |
| Python + Pillow | Automated image optimization and HTML image markup auditing. |

**Important:** Node.js, Sharp, Python, and Pillow are used only during development. They are not runtime dependencies of the deployed website.

---

## 🏗️ Architecture

The website follows a lightweight static architecture.

The public portfolio is delivered directly as HTML, CSS, JavaScript, and static assets. Most interface behavior runs in the browser, while the guestbook communicates with Supabase.

### High-Level Architecture

```text
                  VISITOR
                     |
                     v
           +-------------------+
           |  Static Portfolio |
           |    index.html     |
           +-------------------+
                     |
          +----------+----------+
          |                     |
          v                     v
  +---------------+    +------------------+
  | Frontend UI   |    | Project Pages    |
  | HTML/CSS/JS   |    | projects/*.html  |
  +---------------+    +------------------+
          |
          v
  +-------------------+
  | Guestbook Module  |
  | js/guestbook.js   |
  +-------------------+
          |
          v
  +----------------------------+
  |          Supabase          |
  |                            |
  | REST API (read comments)   |
  | Edge Function (submission) |
  | Comments Table             |
  +----------------------------+
```

### Design Decisions

**1. No frontend framework**

The website uses native browser technologies without React, Vue, or another frontend framework.

This keeps the runtime architecture straightforward and avoids unnecessary framework and build dependencies for a personal portfolio.

**2. Separation of responsibilities**

General navigation and interactive UI behavior are implemented in `js/script.js`, while guestbook functionality is handled separately in `js/guestbook.js`.

**3. Static-first delivery**

The portfolio can be served by a static hosting provider without requiring a server-side application or build process.

**4. External service integration**

Supabase is used specifically for the guestbook, keeping the remaining portfolio sections independent of a backend service.

---

## 📁 Project Structure

```text
portfolio/
│
├── index.html
│
├── css/
│   └── style.css
│
├── js/
│   ├── script.js
│   └── guestbook.js
│
├── projects/
│   └── [standalone project detail pages]
│
├── assets/
│   ├── images/
│   │   ├── profile/
│   │   ├── education/
│   │   ├── experience/
│   │   ├── projects/
│   │   ├── branding/
│   │   └── backgrounds/
│   │
│   └── documents/
│       └── [CV PDF]
│
├── scripts/
│   ├── optimize-mobile-images.js
│   └── optimize-mobile-images.py
│
├── package.json
├── requirements.txt
├── PROJECT.md
├── AGENTS.md
└── README.md
```

The project separates content, styling, interaction logic, and media assets to make the website easier to navigate and maintain.

For additional technical context, see [`PROJECT.md`](PROJECT.md).

---

## 💬 Guestbook Integration

The contact section includes a guestbook that allows visitors to leave comments.

Unlike the rest of the static portfolio, this feature communicates with Supabase.

### Guestbook Workflow

1. The visitor opens the guestbook and reads existing comments.
2. The frontend retrieves comments from the Supabase `comments` table through its REST API.
3. The visitor submits a new comment using the guestbook form.
4. The submission is sent to the Supabase Edge Function named `submit-comment`.
5. The backend processes the submission, subject to the deployed function's implementation and access policies.
6. Guestbook data is stored in Supabase.

### Security Considerations

The frontend uses a Supabase publishable key (`sb_publishable_...`), which is intended for use in public client applications.

This key is not a service-role secret. Access to data and operations must still be restricted through appropriate Row Level Security (RLS) policies and server-side controls.

The repository does not establish that the live guestbook's security configuration has been fully audited. Deployment-specific RLS policies and Edge Function protections should be reviewed before production use.

---

## 📱 Responsive Image Optimization

To improve media delivery on smaller screens, the project supports dedicated mobile image variants.

Images with a corresponding `-mobile.webp` file are served using the HTML `<picture>` element:

```html
<picture>
  <source
    media="(max-width: 650px)"
    srcset="assets/images/profile/photo-mobile.webp"
  />
  <img
    src="assets/images/profile/photo.webp"
    alt="Profile photograph"
  />
</picture>
```

The repository includes two independent image optimization utilities.

### Node.js + Sharp

```bash
npm install
node scripts/optimize-mobile-images.js
```

Uses an explicit source-to-output manifest to generate selected mobile image variants with controlled optimization settings.

### Python + Pillow

```bash
python -m venv .venv
pip install -r requirements.txt

# Generate a dry-run report
python scripts/optimize-mobile-images.py

# Apply supported HTML picture updates
python scripts/optimize-mobile-images.py --apply-html
```

Automatically scans image directories for candidates and can audit or update supported image markup.

Both utilities preserve original image files and generate or refresh their corresponding mobile WebP variants.

---

## ⚙️ Getting Started

You can run the portfolio locally without installing a frontend framework or running a build command.

### 1. Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

### 2. Run the Website

**Option A — Open directly**

Open `index.html` in your browser.

**Option B — Use a local static server (recommended)**

Using Node.js:

```bash
npx serve .
```

Or using Python:

```bash
python -m http.server 8000
```

With the Python server, open:

```text
http://localhost:8000
```

A static server provides more consistent behavior for relative paths and browser caching.

### 3. Review External Configuration

Most of the website works as a static frontend.

The guestbook requires valid Supabase project configuration, deployed backend resources, and appropriate access policies to operate correctly.

The local development utilities are optional and are not required for viewing the website.

---

## 🌐 Deployment

The portfolio is designed for static hosting.

Compatible deployment approaches include:

- GitHub Pages
- Netlify
- Vercel static hosting
- Other static web hosting providers

No frontend compilation or build command is required.

The deployment must preserve the root `index.html` and relative asset paths.

Folder names and relative links should maintain consistent lowercase casing to avoid issues on case-sensitive hosting environments.

---

## 🎯 Engineering Focus

This project demonstrates several areas of my frontend development practice.

**Frontend Fundamentals**

Building a complete website using semantic HTML, CSS, and JavaScript without depending on a frontend framework.

**Interactive Web Interfaces**

Implementing custom navigation, carousels, scroll effects, and event-driven browser interactions.

**Responsive Development**

Adapting content, layouts, and images for different device sizes.

**External API Integration**

Connecting a frontend interface to Supabase for data retrieval and guestbook submissions.

**Maintainability**

Organizing files by responsibility and introducing development utilities to streamline repetitive image preparation tasks.

---

## 🔄 Continuous Improvement

The portfolio is an evolving personal project. Areas of ongoing improvement include:

- Refining interactive transitions and visual consistency.
- Improving certification carousel behavior and card layouts.
- Reviewing frontend maintainability and removing unused or duplicated code where appropriate.
- Validating responsive behavior across devices.
- Reviewing guestbook security and backend configuration.
- Improving performance and accessibility through iterative testing.

These are ongoing development goals rather than claims of completed optimization.

---

## 📬 Contact

**Rajendra Aria Nismara**

I'm open to connecting with developers, recruiters, and professionals interested in my work.

- **Portfolio:** [Visit Website](YOUR_LIVE_WEBSITE_URL)
- **LinkedIn:** [Connect on LinkedIn](YOUR_LINKEDIN_URL)
- **GitHub:** [Explore My Repositories](YOUR_GITHUB_PROFILE_URL)

---

## 📄 Additional Documentation

For more information about the project architecture, design goals, and contribution guidelines:

- [`PROJECT.md`](PROJECT.md) — Project goals, sections, and architecture.
- [`AGENTS.md`](AGENTS.md) — Contribution and development guidelines.

---

<sub>Designed and developed by Rajendra Aria Nismara.</sub>
