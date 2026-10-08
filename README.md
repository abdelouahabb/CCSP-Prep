# 🛡️ ISC2 CCSP Mastery Hub

**From Superficial Cloud Knowledge to Deep Cloud Security Architect**

An interactive, zero-dependency single-page web application designed to prepare candidates for the **ISC2 Certified Cloud Security Professional (CCSP)** exam. Built specifically for learners who want to bridge the gap from surface-level cloud familiarity to the deep architectural, technical, operational, and legal mastery required to pass the official ISC2 exam.

---

## ✨ Key Features

### 1. 🗂️ 70 Interactive Deep-Dive Study Cards (Across All 6 Domains)
Every study card is structured to transform how you think about cloud security:
- **🧐 Common Superficial View**: Highlights the everyday misconception or surface-level assumption beginners make.
- **🎓 Deep CCSP Architect Reality**: Exhaustive, markdown-formatted technical & managerial deep-dive covering the exact concepts tested on the exam.
- **🏢 Real-World Cloud Scenario**: Concrete enterprise architecture examples showing how the concept plays out in production.
- **🤝 Shared Responsibility Breakdown**: Clarifies what belongs to the Cloud Service Provider (CSP) vs. the Cloud Service Customer (CSC) across IaaS, PaaS, and SaaS.
- **⚠️ ISC2 Exam Trap Callout**: Explicit warnings on how ISC2 phrases trick questions and distractors around that topic.
- **📜 Mapped Standards**: Direct tags linking to ISO/IEC, NIST, AICPA SOC, CSA, and OWASP frameworks.
- **Interactive Deck & Grid Modes**: Flip/collapse cards using keyboard shortcuts (`←`, `→`, `Space`), filter by domain or mastery status (*New/Unread*, *Still Learning*, *Mastered*, *Bookmarked*), or search across all cards in real time.

### 2. 🎯 180 Scenario-Based Exam Questions & Dual Quiz Engine
A massive reference question bank (30 questions per domain across all 6 domains) written in the style of ISC2 scenario questions:
- **💡 Deep-Learn Practice Mode**: Instant feedback after each choice featuring:
  - Full architectural explanation of **why the correct option wins**.
  - **🔍 Distractor Analysis**: Detailed breakdown of **why each of the other 3 options fails**.
  - **🎯 ISC2 Exam Tip**: Actionable memory hooks and exam-day heuristics.
- **⏱️ Timed Exam Simulation Mode**: Simulates the real exam environment with a live countdown timer, question flagging (`🚩`), a question navigator palette, and a post-exam **Domain-by-Domain Diagnostic Report**.
- **Smart Filtering**: Practice *All Questions*, *Unanswered Only*, *Previously Missed / Incorrect Questions*, *Bookmarked Questions*, or *Hard Difficulty Only*.

### 3. 📚 Searchable Question Bank Reference Explorer
- Browse and search all **180 questions, answers, distractor analyses, and explanations** as an open-book reference guide.
- Toggle individual answers or reveal all explanations at once for rapid pre-exam review.

### 4. 🧭 Master Standards Matrix, Shared Responsibility & Cheat Sheets
- **📜 ISO / NIST / SOC / CSA Standards Matrix**: Searchable reference covering **37 essential standards** (ISO/IEC 17788, 17789, 27001, 27017, 27018, 27034, 27035, 27036, 27037, 27040, 27050, 15408, NIST SP 800-145, 500-292, 800-34, 800-37, 800-53, 800-57, 800-61, 800-88, 800-92, 800-125, 800-190, 800-207, NISTIR 8006, FIPS 140-3, RFC 3227, SOC 1/2/3 Type I & II, CSA CCM/CAIQ/STAR).
- **🤝 Shared Responsibility Matrix**: Layer-by-layer ownership comparison across **On-Premises, IaaS, PaaS, and SaaS**.
- **🔢 Critical Exam Numbers & Formulas Cheat Sheet**: Quick-reference cards for Uptime Institute Tiers (I–IV), ASHRAE temperature/humidity ranges, Quantitative Risk formulas (`SLE`, `ALE`, `CBA`), BCDR metrics (`RPO`, `RTO`, `MTD`), IAM Federation protocols (`SAML 2.0`, `OAuth 2.0`, `OIDC`, `SCIM`), AppSec testing (`SAST`, `DAST`, `IAST`, `SCA`, `RASP`), and Forensic Order of Volatility (`RFC 3227`).

### 5. 💾 Persistent Local Progress Tracking & Dark/Light Theme
- Automatically saves your mastered cards, learning queue, bookmarks, and quiz accuracy history in browser `localStorage` (zero backend or database setup required).

---

## 📊 Coverage Across the 6 Official ISC2 CCSP Exam Domains

| Domain | Official ISC2 Domain Title | Exam Weight | Study Cards | Scenario Questions |
| :--- | :--- | :---: | :---: | :---: |
| **Domain 1** | Cloud Concepts, Architecture and Design | **17%** | 15 | 30 |
| **Domain 2** | Cloud Data Security | **20%** | 13 | 30 |
| **Domain 3** | Cloud Platform & Infrastructure Security | **17%** | 10 | 30 |
| **Domain 4** | Cloud Application Security | **17%** | 12 | 30 |
| **Domain 5** | Cloud Security Operations | **16%** | 10 | 30 |
| **Domain 6** | Legal, Risk and Compliance | **13%** | 10 | 30 |
| **Total** | **All 6 Official Domains + Reference Matrices** | **100%** | **70** | **180** |

---

## 🚀 Quick Start

No build tools, `npm install`, or external dependencies are required.

### Option 1: Open Directly in Browser
Simply open `index.html` in any modern web browser (Chrome, Firefox, Edge, Safari).

### Option 2: Run with a Local HTTP Server
Clone the repository and serve the directory using Python, Node, or any static file server:

```bash
# Using Python 3
python3 -m http.server 8080

# Or using Node.js (npx)
npx serve -l 8080
```

Then open **`http://localhost:8080`** in your browser.

---

## 📁 Project Structure

```text
.
├── index.html                 # Main Single-Page Application UI
├── styles.css                 # Responsive Dark/Light theme styling & components
├── app.js                     # Application state, deck engine, quiz simulator & search
├── README.md                  # Project documentation
└── data/
    ├── domain1.js             # Domain 1: Cloud Concepts, Architecture and Design
    ├── domain2.js             # Domain 2: Cloud Data Security
    ├── domain3.js             # Domain 3: Cloud Platform & Infrastructure Security
    ├── domain4.js             # Domain 4: Cloud Application Security
    ├── domain5.js             # Domain 5: Cloud Security Operations
    ├── domain6.js             # Domain 6: Legal, Risk and Compliance
    └── extra_content.js       # Cross-domain cards, bonus questions & reference matrices
```

---

## ⌨️ Keyboard Shortcuts (Interactive Study Cards)

- **`→` (Right Arrow)**: Next Study Card
- **`←` (Left Arrow)**: Previous Study Card
- **`Space`**: Expand / Collapse Deep-Dive Explanation

---

## 🧠 How to Study Effectively with This App

1. **Read the 6 Golden Rules on the Dashboard First**: Internalize the ISC2 mindset (*Human safety first*, *Ultimate legal accountability never transfers*, *Cryptographic erasure in multi-tenant clouds*, *Legal Hold overrides auto-deletion*).
2. **Go Domain-by-Domain in the Interactive Study Deck**: Start with **Domain 1** and **Domain 2** (which together account for **37%** of the exam). Compare the *Superficial View* with the *Deep CCSP Architect Reality* and mark cards as **🔄 Still Learning** or **✅ Mastered**.
3. **Run 15–20 Question Deep-Learn Quizzes**: After studying a domain's cards, take a **Deep-Learn Practice Quiz** on that domain. Read the **Distractor Analysis** even when you get a question right so you understand why the other 3 choices are wrong.
4. **Drill Your Missed Questions**: Use the **🎯 Drill Missed & Weak Questions** button on the Dashboard until your accuracy exceeds **80%+** across every domain.
5. **Take a Full 125-Question Timed Simulation**: Once all domains are above 80%, run a **Timed Exam Simulation** to build exam-day stamina.
