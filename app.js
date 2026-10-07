(function () {
  'use strict';

  const COURSE = window.COURSE;
  const COURSE_CHECKS = window.COURSE_CHECKS || {};
  const VISUAL_CHALLENGES = window.VISUAL_CHALLENGES || {};
  const STORAGE_KEY = 'htmllab-state-v1';
  const PROFILE_STORAGE_KEY = 'htmllab-profiles-v2';
  const ACTIVE_PROFILE_KEY = 'htmllab-active-profile-v2';
  const RESULT_KEY = 'htmllab-results-v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function createDefaultState(user = null) {
    return {
      courseSlug: COURSE.slug,
      user,
      view: 'dashboard',
      selectedModule: COURSE.modules[0].id,
      viewedModules: [],
      questionOrder: [],
      currentIndex: 0,
      answers: {},
      feedback: {},
      startedAt: null,
      elapsedSeconds: 0,
      finishedAt: null,
      lastResult: null
    };
  }

  let activeTimerStartedAt = null;
  let codeEditorInstance = null;
  let state = loadState();
  let timerHandle = null;

  function loadState() {
    try {
      const profiles = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
      const activeProfile = localStorage.getItem(ACTIVE_PROFILE_KEY);
      if (activeProfile && profiles[activeProfile]) return hydrateState(profiles[activeProfile]);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved ? hydrateState(saved) : createDefaultState();
    } catch (error) {
      return createDefaultState();
    }
  }

  function hydrateState(saved) {
    const candidate = { ...createDefaultState(), ...saved };
    candidate.elapsedSeconds = Number.isFinite(Number(candidate.elapsedSeconds)) ? Number(candidate.elapsedSeconds) : 0;
    activeTimerStartedAt = null;
    const validQuestionIds = new Set(COURSE.questions.map((question) => question.id));
    const validModuleIds = new Set(COURSE.modules.map((module) => module.id));
    candidate.viewedModules = (candidate.viewedModules || []).filter((moduleId) => validModuleIds.has(moduleId));
    const hasStaleExam = candidate.questionOrder?.length && (candidate.questionOrder.length !== COURSE.questions.length || candidate.questionOrder.some((questionId) => !validQuestionIds.has(questionId)));
    if (hasStaleExam) {
      candidate.questionOrder = [];
      candidate.currentIndex = 0;
      candidate.answers = {};
      candidate.feedback = {};
      candidate.startedAt = null;
      candidate.elapsedSeconds = 0;
      candidate.finishedAt = null;
      candidate.lastResult = null;
    }
    return candidate.courseSlug === COURSE.slug ? candidate : createDefaultState(candidate.user || null);
  }

  function profileKey(user) {
    return `${String(user.npm).trim().toLowerCase()}::${String(user.name).trim().toLowerCase()}`;
  }

  function readProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}'); } catch (error) { return {}; }
  }

  function loadProfile(user) {
    const profiles = readProfiles();
    return profiles[profileKey(user)] ? hydrateState({ ...profiles[profileKey(user)], user }) : null;
  }

  function persist() {
    if (!state.user) return;
    const profiles = readProfiles();
    profiles[profileKey(state.user)] = state;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
    localStorage.setItem(ACTIVE_PROFILE_KEY, profileKey(state.user));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
  }

  function highlightCode(code = '') {
    const escaped = escapeHtml(code);
    return escaped
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="syntax-comment">$1</span>')
      .replace(/(&lt;\/?)([a-z][\w-]*)([^&]*?)(&gt;)/gi, (match, bracket, tag, attributes, close) => {
        const styledAttributes = attributes.replace(/([a-z_:][\w:.-]*)(=)(&quot;.*?&quot;|&#039;.*?&#039;|[^\s]+)/gi, '<span class="syntax-attr">$1</span><span class="syntax-equals">$2</span><span class="syntax-string">$3</span>');
        return `<span class="syntax-bracket">${bracket}</span><span class="syntax-tag">${tag}</span>${styledAttributes}<span class="syntax-bracket">${close}</span>`;
      });
  }

  function normalize(value = '') {
    return value.replace(/\r/g, '').trim().toLowerCase();
  }

  function shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [output[index], output[randomIndex]] = [output[randomIndex], output[index]];
    }
    return output;
  }

  function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const remaining = (safeSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remaining}`;
  }

  function formatDate(date = new Date()) {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function setView(view) {
    state.view = view;
    persist();
    $$('.page-view').forEach((page) => page.classList.toggle('hidden', page.id !== `${view}-view`));
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    if (view !== 'exam') stopTimer();
    if (view === 'dashboard') renderDashboard();
    if (view === 'lesson') renderLesson();
    if (view === 'exam') renderExam();
    if (view === 'result') renderResult();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(message, type = 'info') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => { toast.className = 'toast'; }, 3200);
  }

  function renderShell() {
    const loggedIn = Boolean(state.user);
    $('#login-screen').classList.toggle('hidden', loggedIn);
    $('#app-shell').classList.toggle('hidden', !loggedIn);
    if (!loggedIn) return;
    const firstName = state.user.name.split(' ')[0];
    $('#profile-name').textContent = firstName;
    $('#profile-npm').textContent = state.user.npm;
    $('#avatar').textContent = firstName.charAt(0).toUpperCase();
    $('#topbar-date').textContent = formatDate();
    setView(state.view);
  }

  function renderDashboard() {
    const completed = state.lastResult ? state.lastResult.score : 0;
    const viewed = state.viewedModules.length;
    const learningPercent = Math.round((viewed / COURSE.modules.length) * 100);
    const hasExam = hasCurrentExam() && !state.finishedAt;
    $('#dashboard-view').innerHTML = `
      <section class="hero-section">
        <div class="hero-copy">
          <p class="eyebrow">${COURSE.label}</p>
          <h2>Hey, ${escapeHtml(state.user.name.split(' ')[0])}<span class="hero-dot">.</span><br /><em>Ready to ship?</em></h2>
          <p>${COURSE.description} Hari ini kita akan membongkar cara browser membaca struktur web.</p>
          <button class="primary-button" data-action="start-learning">${hasExam ? 'Lanjutkan challenge' : 'Mulai challenge'} <span>↗</span></button>
        </div>
        <div class="hero-code" aria-label="Contoh kode HTML">
          <div class="code-window-head"><span class="window-dots"><i></i><i></i><i></i></span><span>index.html</span><span class="code-lang">HTML</span></div>
          <pre><code><span class="code-tag">&lt;main</span> <span class="code-attr">class</span>=<span class="code-string">"your-journey"</span><span class="code-tag">&gt;</span>
  <span class="code-tag">&lt;h1&gt;</span><span class="code-text">Build something real.</span><span class="code-tag">&lt;/h1&gt;</span>
  <span class="code-tag">&lt;p&gt;</span><span class="code-text">One tag at a time.</span><span class="code-tag">&lt;/p&gt;</span>
<span class="code-tag">&lt;/main&gt;</span></code></pre>
          <div class="code-status"><span class="status-dot"></span> Your canvas is ready</div>
        </div>
      </section>

      <section class="stat-grid">
        <div class="stat-card"><div class="stat-icon cyan">✦</div><div><span class="stat-label">Learning progress</span><strong>${learningPercent}<small>%</small></strong><div class="mini-progress"><span style="width:${learningPercent}%"></span></div></div></div>
        <div class="stat-card"><div class="stat-icon violet">⌁</div><div><span class="stat-label">Total challenges</span><strong>${COURSE.questions.length}<small> soal</small></strong><span class="stat-sub">1 soal / 1 materi</span></div></div>
        <div class="stat-card"><div class="stat-icon lime">◉</div><div><span class="stat-label">Last score</span><strong>${state.lastResult ? completed : '--'}<small>${state.lastResult ? '/ 100' : ' belum ada'}</small></strong><span class="stat-sub">${state.lastResult ? formatDate(new Date(state.lastResult.completedAt)) : 'Your first run awaits'}</span></div></div>
      </section>

      <section class="section-heading"><div><p class="eyebrow">THE CURRICULUM</p><h3>Map your learning path</h3></div><button class="text-button" data-view="lesson">Lihat semua <span>→</span></button></section>
      <section class="module-grid">${COURSE.modules.map((module, index) => {
        const isViewed = state.viewedModules.includes(module.id);
        return `<button class="module-card ${isViewed ? 'is-complete' : ''}" data-module="${module.id}"><div class="module-card-top"><span class="module-number">${module.number}</span><span class="module-icon">${module.icon}</span></div><h4>${module.title}</h4><p>${module.description}</p><div class="module-card-foot"><span>${isViewed ? 'Explored' : `${index === 0 ? 'Start here' : 'Next step'}`}</span><span class="module-arrow">↗</span></div></button>`;
      }).join('')}</section>

      <section class="bottom-rail"><div class="quote-card"><span class="quote-mark">“</span><p>The web is not a collection of pages. It is a conversation.</p><span class="quote-author">— HTML LAB / FIELD NOTE 001</span></div><div class="challenge-card"><div><p class="eyebrow">PRACTICE ZONE</p><h3>${hasExam ? 'Your challenge is in progress' : `${COURSE.questions.length} prompts. 1 skill stack.`}</h3><p>Lengkapi kode, cek jawaban, dan lihat sejauh mana skill kamu berkembang.</p></div><span class="challenge-orb">✦</span></div></section>
    `;
    bindDashboardEvents();
  }

  function bindDashboardEvents() {
    $('[data-action="start-learning"]')?.addEventListener('click', () => {
      if (hasCurrentExam() && !state.finishedAt) setView('exam');
      else startExam();
    });
    $$('[data-module]').forEach((button) => button.addEventListener('click', () => {
      state.selectedModule = button.dataset.module;
      persist();
      setView('lesson');
    }));
    $$('[data-view="lesson"]').forEach((button) => button.addEventListener('click', () => setView('lesson')));
  }

  function renderLesson() {
    const activeModule = COURSE.modules.find((module) => module.id === state.selectedModule) || COURSE.modules[0];
    if (!state.viewedModules.includes(activeModule.id)) {
      state.viewedModules.push(activeModule.id);
      persist();
    }
    const moduleQuestions = COURSE.questions.filter((question) => question.module === activeModule.id);
    $('#lesson-view').innerHTML = `
      <section class="page-intro"><div><p class="eyebrow">LEARNING PATH / ${activeModule.number}</p><h2>${activeModule.title}<span class="hero-dot">.</span></h2><p>${activeModule.description} Pelajari konsepnya, lalu uji dengan prompt di akhir perjalanan.</p></div><div class="lesson-progress"><span>MODULE ${activeModule.number} / ${String(COURSE.modules.length).padStart(2, '0')}</span><strong>${Math.round((state.viewedModules.length / COURSE.modules.length) * 100)}%</strong><div class="progress-line"><span style="width:${Math.round((state.viewedModules.length / COURSE.modules.length) * 100)}%"></span></div></div></section>
      <div class="module-tabs">${COURSE.modules.map((module) => `<button class="module-tab ${module.id === activeModule.id ? 'active' : ''}" data-module-tab="${module.id}"><span>${module.number}</span>${module.title}</button>`).join('')}</div>
      <section class="lesson-layout"><div class="lesson-main"><div class="lesson-banner"><span class="big-module-icon">${activeModule.icon}</span><div><p class="eyebrow">CONCEPT DROP</p><h3>${activeModule.title}</h3><p>${activeModule.description}</p></div></div><div class="module-lesson-copy"><p class="eyebrow">PENJELASAN MATERI</p><p>${escapeHtml(activeModule.explanation)}</p><div class="lesson-code detailed-example"><div class="code-window-head"><span class="window-dots"><i></i><i></i><i></i></span><span>example.html</span><span class="code-lang">DRACULA</span></div><pre><code>${highlightCode(activeModule.example)}</code></pre></div></div><div class="concept-card module-detail-card"><div class="concept-body"><span class="concept-tag">Yang akan kamu kuasai</span><ul class="concept-points">${activeModule.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul></div></div><div class="concept-list">${moduleQuestions.map((question, index) => `<article class="concept-card"><div class="concept-index">${String(index + 1).padStart(2, '0')}</div><div class="concept-body"><span class="concept-tag">${question.lessonTitle}</span><p>${question.lessonBody}</p><div class="lesson-code"><div class="code-window-head"><span class="window-dots"><i></i><i></i><i></i></span><span>snippet.html</span><span class="code-lang">DRACULA</span></div><pre><code>${highlightCode(question.lessonCode)}</code></pre></div></div></article>`).join('')}</div></div><aside class="lesson-aside"><div class="aside-sticky"><p class="eyebrow">CHECKPOINT</p><h3>Ready to<br /><em>test your flow?</em></h3><p>${moduleQuestions.length} challenge dari modul ini menunggumu di dalam ujian utama.</p><div class="checkpoint-count"><strong>${moduleQuestions.length}</strong><span>coding prompts</span></div><button class="primary-button full-button" data-action="start-exam">Go to challenge <span>↗</span></button></div></aside></section>
    `;
    $$('[data-module-tab]').forEach((tab) => tab.addEventListener('click', () => { state.selectedModule = tab.dataset.moduleTab; renderLesson(); }));
    $('[data-action="start-exam"]').addEventListener('click', () => startExam());
  }

  function startExam() {
    if (!hasCurrentExam() || state.finishedAt) {
      state.questionOrder = shuffle(COURSE.questions.map((question) => question.id));
      state.currentIndex = 0;
      state.answers = {};
      state.feedback = {};
      state.startedAt = Date.now();
      state.elapsedSeconds = 0;
      activeTimerStartedAt = null;
      state.finishedAt = null;
      state.lastResult = null;
      persist();
    }
    setView('exam');
  }

  function hasCurrentExam() {
    const validQuestionIds = new Set(COURSE.questions.map((question) => question.id));
    return state.questionOrder.length === COURSE.questions.length && state.questionOrder.every((questionId) => validQuestionIds.has(questionId));
  }

  function currentQuestion() {
    const questionId = state.questionOrder[state.currentIndex];
    return COURSE.questions.find((question) => question.id === questionId) || COURSE.questions[0];
  }

  function validateQuestion(question, answer = '') {
    const checks = COURSE_CHECKS[question.id];
    if (!checks || typeof DOMParser === 'undefined') {
      const normalized = normalize(answer);
      const passed = question.required.every((pattern) => new RegExp(pattern, 'i').test(normalized));
      return { passed, message: passed ? 'Nice. Struktur kodenya sudah sesuai.' : 'Belum pas. Cek kembali tag dan atribut yang diminta.' };
    }
    const documentFragment = new DOMParser().parseFromString(answer, 'text/html');
    const result = checks.map((check) => evaluateCheck(documentFragment, check)).find((item) => !item.passed);
    return result ? { passed: false, message: result.message } : { passed: true, message: 'Nice. Struktur HTML-nya sudah sesuai.' };
  }

  function cleanText(value = '') {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function firstElement(documentFragment, tag) {
    return documentFragment.querySelector(tag);
  }

  function evaluateCheck(documentFragment, check) {
    const element = firstElement(documentFragment, check.tag);
    const text = cleanText(check.text);
    if (check.kind === 'doctype') return { passed: documentFragment.doctype?.name?.toLowerCase() === 'html', message: 'Tambahkan <!doctype html> di awal kode.' };
    if (check.kind === 'hasTags') {
      const missing = check.tags.find((tag) => !documentFragment.querySelector(tag));
      return { passed: !missing, message: missing ? `Tambahkan tag <${missing}> pada struktur HTML.` : 'Semua tag yang dibutuhkan sudah ada.' };
    }
    if (check.kind === 'attribute') return { passed: Boolean(element && element.getAttribute(check.attr)?.trim().toLowerCase() === check.value.toLowerCase()), message: `Pastikan tag ${check.tag} memiliki atribut ${check.attr}="${check.value}".` };
    if (check.kind === 'hasAttribute') {
      const matches = Array.from(documentFragment.querySelectorAll(check.tag)).some((item) => check.value === undefined ? item.hasAttribute(check.attr) : item.getAttribute(check.attr)?.trim().toLowerCase() === check.value.toLowerCase());
      return { passed: matches, message: `Pastikan tag ${check.tag} memiliki attribute ${check.attr}${check.value ? `="${check.value}"` : ''}.` };
    }
    if (check.kind === 'hasAttributes') {
      const missing = check.attrs.find((item) => !documentFragment.querySelector(`${item.tag}[${item.attr}]`));
      return { passed: !missing, message: missing ? `Pastikan ${missing.tag} memiliki attribute ${missing.attr}.` : 'Attribute form sudah lengkap.' };
    }
    if (check.kind === 'inputTypes') {
      const types = new Set(Array.from(documentFragment.querySelectorAll('input')).map((input) => input.getAttribute('type')?.toLowerCase()));
      const missing = check.values.find((type) => !types.has(type));
      return { passed: !missing, message: missing ? `Tambahkan input dengan type="${missing}".` : 'Semua jenis input sudah tersedia.' };
    }
    if (check.kind === 'elementText') return { passed: Boolean(element && cleanText(element.textContent) === text), message: `Gunakan tag ${check.tag} dengan isi “${check.text}”.` };
    if (check.kind === 'containsText') return { passed: Boolean(element && cleanText(element.textContent).includes(text)), message: `Bungkus teks “${check.text}” dengan tag ${check.tag}.` };
    if (check.kind === 'containsElementText') return { passed: Boolean(documentFragment.querySelector(check.parent)?.querySelector(check.child) && cleanText(documentFragment.querySelector(check.parent).querySelector(check.child).textContent) === text), message: `Pastikan ${check.child} “${check.text}” berada di dalam ${check.parent}.` };
    if (check.kind === 'listText') {
      const list = firstElement(documentFragment, check.tag);
      const values = list ? Array.from(list.querySelectorAll(':scope > li')).map((item) => cleanText(item.textContent)) : [];
      const expected = check.values.map(cleanText);
      return { passed: Boolean(list && expected.every((value, index) => values[index] === value)), message: `Buat ${check.tag} dengan urutan: ${check.values.join(', ')}.` };
    }
    if (check.kind === 'labelInput') {
      const label = documentFragment.querySelector(`label[for="${check.labelFor}"]`);
      const input = documentFragment.querySelector(`input#${check.inputId}`);
      return { passed: Boolean(label && input && cleanText(label.textContent) === text), message: `Hubungkan label for="${check.labelFor}" dengan input id="${check.inputId}".` };
    }
    if (check.kind === 'inputAttributes') {
      const input = documentFragment.querySelector('input');
      const passed = Boolean(input && input.getAttribute('type')?.toLowerCase() === check.type && input.getAttribute('name')?.toLowerCase() === check.name && input.hasAttribute('required'));
      return { passed, message: 'Input harus memiliki type="email", name="email", dan required.' };
    }
    if (check.kind === 'button') {
      const button = documentFragment.querySelector(`button[type="${check.type}"]`);
      return { passed: Boolean(button && cleanText(button.textContent) === text), message: `Buat button type="${check.type}" dengan teks “${check.text}”.` };
    }
    if (check.kind === 'tableHeaders') {
      const headers = Array.from(documentFragment.querySelectorAll('table thead th')).map((item) => cleanText(item.textContent));
      const expected = check.values.map(cleanText);
      return { passed: expected.every((value, index) => headers[index] === value), message: `Gunakan thead dengan header: ${check.values.join(' dan ')}.` };
    }
    if (check.kind === 'media') {
      const media = firstElement(documentFragment, check.tag);
      return { passed: Boolean(media && media.getAttribute(check.attr) === check.value && media.hasAttribute(check.requiredAttr)), message: `Gunakan ${check.tag} dengan src="${check.value}" dan atribut ${check.requiredAttr}.` };
    }
    if (check.kind === 'comment') {
      const comments = [];
      const walker = documentFragment.createTreeWalker(documentFragment, NodeFilter.SHOW_COMMENT);
      let node;
      while ((node = walker.nextNode())) comments.push(cleanText(node.nodeValue));
      return { passed: comments.includes(cleanText(check.text)), message: `Tambahkan komentar HTML: <!-- ${check.text} -->.` };
    }
    if (check.kind === 'metaContent') {
      const meta = documentFragment.querySelector(`meta[name="${check.name}"]`);
      return { passed: Boolean(meta && cleanText(meta.getAttribute('content')) === cleanText(check.content)), message: `Tambahkan meta name="${check.name}" dengan content yang sesuai.` };
    }
    return { passed: false, message: 'Cek kembali struktur kode HTML.' };
  }

  function renderExam() {
    if (state.questionOrder.length && !hasCurrentExam()) {
      state.questionOrder = [];
      state.currentIndex = 0;
      state.answers = {};
      state.feedback = {};
      state.startedAt = null;
      state.elapsedSeconds = 0;
      state.finishedAt = null;
      state.lastResult = null;
      persist();
      startExam();
      return;
    }
    if (!state.questionOrder.length || state.finishedAt) {
      $('#exam-view').innerHTML = `<div class="empty-state"><span>✦</span><h2>Your challenge awaits.</h2><p>Mulai ujian untuk mendapatkan ${COURSE.questions.length} prompt HTML yang diacak.</p><button class="primary-button" data-action="begin">Begin challenge ↗</button></div>`;
      $('[data-action="begin"]').addEventListener('click', startExam);
      return;
    }
    const question = currentQuestion();
    const feedback = state.feedback[question.id];
    const visualChallenge = VISUAL_CHALLENGES[question.id];
    const progress = Math.round(((state.currentIndex + 1) / state.questionOrder.length) * 100);
    const insight = question.hint || (visualChallenge ? visualChallenge.clue : question.lessonBody);
    const lessonVisual = visualChallenge ? `<div class="visual-target"><div class="visual-target-head"><span class="window-dots"><i></i><i></i><i></i></span><span>${visualChallenge.label}</span><span class="code-lang">BROWSER</span></div><div class="target-browser">${visualChallenge.html}</div><div class="visual-clue"><span>✦</span><div><strong>CLUE</strong><p>${visualChallenge.clue}</p></div></div></div>` : `<div class="lesson-code large"><div class="code-window-head"><span class="window-dots"><i></i><i></i><i></i></span><span>concept.html</span><span class="code-lang">DRACULA</span></div><pre><code>${highlightCode(question.lessonCode)}</code></pre></div><div class="insight"><span>✦</span><span><strong>QUICK INSIGHT</strong>${escapeHtml(insight)}</span></div>`;
    const visualPrompt = visualChallenge ? 'Bangun potongan HTML yang menghasilkan tampilan preview target di sebelah kiri.' : question.prompt;
    const challengeSteps = question.steps || ['Baca permintaan soal.', 'Tulis HTML secara manual.', 'Klik Check code untuk melihat hasil validasi.'];
    $('#exam-view').innerHTML = `
      <section class="exam-topline"><div><p class="eyebrow">HTML CHALLENGE / LIVE SESSION</p><h2>Complete the layer<span class="hero-dot">.</span></h2></div><div class="exam-clock"><span class="clock-icon">◷</span><div><span>ACTIVE ELAPSED TIME</span><strong id="elapsed-time">${formatDuration(getElapsedSeconds())}</strong></div></div></section>
      <div class="exam-progress-row"><span>CHALLENGE <strong>${String(state.currentIndex + 1).padStart(2, '0')}</strong> / ${String(state.questionOrder.length).padStart(2, '0')}</span><span>${progress}% complete · active time only</span></div><div class="exam-progress"><span style="width:${progress}%"></span></div>
      <section class="exam-grid"><div class="lesson-panel"><div class="panel-label"><span class="label-dot"></span> ${visualChallenge ? 'SEE & BUILD' : 'BEFORE YOU CODE'} <span class="panel-module">${COURSE.modules.find((module) => module.id === question.module)?.title || 'HTML'}</span></div><h3>${question.lessonTitle}</h3><p>${visualChallenge ? 'Amati output browser, baca clue, lalu tulis struktur HTML yang dapat menghasilkan tampilan tersebut.' : question.lessonBody}</p>${lessonVisual}</div><div class="question-panel"><div class="question-number">Q${String(state.currentIndex + 1).padStart(2, '0')} <span>of ${String(state.questionOrder.length).padStart(2, '0')}</span></div><h3>${question.title}</h3><div class="challenge-brief"><p class="question-prompt">${visualPrompt}</p><div class="challenge-instructions"><strong>Yang harus kamu lakukan</strong><ol>${challengeSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></div></div><div class="editor-shell ${feedback ? (feedback.passed ? 'passed' : 'failed') : ''}"><div class="editor-head"><span><i></i> answer.html</span><div class="editor-tools"><button type="button" data-editor-action="reset">Reset</button><span class="editor-type">DRACULA · TYPE MANUALLY</span></div></div><textarea id="answer-editor" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Kode jawaban">${escapeHtml(state.answers[question.id] || question.starter)}</textarea><div class="editor-foot"><span>Type manually · ⌘ / Ctrl + Enter to check</span><button id="check-answer" class="check-button">Check code <span>↗</span></button></div></div><div class="clipboard-lock"><span>⌁</span> Copy-paste, cut, dan drag-drop kode dinonaktifkan untuk challenge ini.</div><div class="preview-card"><div class="preview-head"><span><span class="label-dot"></span> LIVE PREVIEW</span><span>lihat hasil HTML kamu</span></div><iframe id="live-preview" title="Preview hasil kode HTML" sandbox=""></iframe></div>${feedback ? `<div class="feedback ${feedback.passed ? 'success' : 'error'}"><span>${feedback.passed ? '✓' : '!'}</span><div><strong>${feedback.passed ? 'Looks good!' : 'Keep iterating'}</strong><p>${feedback.message}</p></div></div>` : ''}<div class="question-actions"><button id="prev-question" class="secondary-button" ${state.currentIndex === 0 ? 'disabled' : ''}>← Previous</button><button id="next-question" class="primary-button">${state.currentIndex === state.questionOrder.length - 1 ? 'Finish test' : 'Next prompt'} <span>→</span></button></div></div></section>
    `;
    bindExamEvents(question);
    startTimer();
  }

  function bindExamEvents(question) {
    const textarea = $('#answer-editor');
    codeEditorInstance = null;
    const updatePreview = () => { const preview = $('#live-preview'); if (preview) preview.srcdoc = getEditorValue(); };
    const updateAnswer = (value) => { state.answers[question.id] = value; persist(); updatePreview(); };

    if (typeof window.CodeMirror === 'function') {
      codeEditorInstance = window.CodeMirror.fromTextArea(textarea, {
        mode: 'text/html',
        theme: 'dracula',
        lineNumbers: true,
        lineWrapping: true,
        tabSize: 2,
        indentUnit: 2,
        indentWithTabs: false,
        viewportMargin: Infinity,
        extraKeys: {
          'Ctrl-Enter': () => checkAnswer(question),
          'Cmd-Enter': () => checkAnswer(question),
          Tab: (instance) => instance.replaceSelection('  '),
          'Ctrl-C': () => showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error'),
          'Cmd-C': () => showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error'),
          'Ctrl-V': () => showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error'),
          'Cmd-V': () => showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error'),
          'Ctrl-X': () => showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error'),
          'Cmd-X': () => showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error')
        }
      });
      codeEditorInstance.on('change', (instance) => updateAnswer(instance.getValue()));
    } else {
      textarea.addEventListener('input', () => updateAnswer(textarea.value));
      textarea.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && ['c', 'v', 'x'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          showToast('Copy-paste diblokir. Ketik kode secara manual.', 'error');
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); checkAnswer(question); }
        if (event.key === 'Tab') { event.preventDefault(); const start = textarea.selectionStart; textarea.value = `${textarea.value.slice(0, start)}  ${textarea.value.slice(textarea.selectionEnd)}`; textarea.selectionStart = textarea.selectionEnd = start + 2; updateAnswer(textarea.value); }
      });
    }
    $('#check-answer').addEventListener('click', () => checkAnswer(question));
    $$('[data-editor-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.editorAction;
      if (action === 'reset') { setEditorValue(question.starter); state.answers[question.id] = question.starter; state.feedback[question.id] = null; persist(); updatePreview(); renderExam(); showToast('Editor dikembalikan ke starter code.'); }
    }));
    bindClipboardLock();
    updatePreview();
    $('#prev-question').addEventListener('click', () => { if (state.currentIndex > 0) { state.currentIndex -= 1; persist(); renderExam(); } });
    $('#next-question').addEventListener('click', () => {
      const answer = getEditorValue();
      const result = validateQuestion(question, answer);
      state.answers[question.id] = answer;
      state.feedback[question.id] = result;
      persist();
      if (!result.passed) { renderExam(); showToast('Coba cek lagi kode kamu.', 'error'); return; }
      if (state.currentIndex === state.questionOrder.length - 1) finishExam();
      else { state.currentIndex += 1; persist(); renderExam(); }
    });
    updatePreview();
  }

  function checkAnswer(question) {
    const answer = getEditorValue();
    state.answers[question.id] = answer;
    state.feedback[question.id] = validateQuestion(question, answer);
    persist();
    renderExam();
    showToast(state.feedback[question.id].passed ? 'Jawaban benar. Keep going!' : 'Belum pas, coba lagi.', state.feedback[question.id].passed ? 'success' : 'error');
  }

  function getEditorValue() {
    return codeEditorInstance ? codeEditorInstance.getValue() : ($('#answer-editor')?.value || '');
  }

  function setEditorValue(value) {
    if (codeEditorInstance) codeEditorInstance.setValue(value);
    else if ($('#answer-editor')) $('#answer-editor').value = value;
  }

  function bindClipboardLock() {
    const exam = $('#exam-view');
    if (!exam || exam.dataset.clipboardLocked === 'true') return;
    exam.dataset.clipboardLocked = 'true';
    ['copy', 'cut', 'paste'].forEach((eventName) => exam.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === 'paste') showToast('Paste diblokir. Ketik kode secara manual.', 'error');
    }));
    exam.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showToast('Context menu dinonaktifkan selama challenge.', 'error');
    });
    exam.addEventListener('dragstart', (event) => event.preventDefault());
    exam.addEventListener('drop', (event) => {
      event.preventDefault();
      showToast('Drag-drop kode diblokir. Ketik kode secara manual.', 'error');
    });
  }

  function startTimer() {
    if (!state.startedAt || state.finishedAt || document.hidden) return;
    if (!activeTimerStartedAt) activeTimerStartedAt = Date.now();
    if (timerHandle) window.clearInterval(timerHandle);
    timerHandle = window.setInterval(() => {
      const element = $('#elapsed-time');
      if (element && state.startedAt) element.textContent = formatDuration(getElapsedSeconds());
    }, 1000);
  }

  function getElapsedSeconds() {
    const liveSeconds = activeTimerStartedAt ? (Date.now() - activeTimerStartedAt) / 1000 : 0;
    return (state.elapsedSeconds || 0) + liveSeconds;
  }

  function stopTimer() {
    if (activeTimerStartedAt) {
      state.elapsedSeconds = Math.max(0, (state.elapsedSeconds || 0) + ((Date.now() - activeTimerStartedAt) / 1000));
      activeTimerStartedAt = null;
      persist();
    }
    if (timerHandle) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function finishExam() {
    stopTimer();
    const passedCount = COURSE.questions.filter((question) => validateQuestion(question, state.answers[question.id] || '').passed).length;
    const durationSeconds = Math.round(state.elapsedSeconds || 0);
    state.finishedAt = Date.now();
    state.lastResult = { score: Math.round((passedCount / COURSE.questions.length) * 100), passedCount, total: COURSE.questions.length, durationSeconds, completedAt: new Date().toISOString() };
    state.view = 'result';
    persist();
    saveResult(state.lastResult);
    setView('result');
  }

  function saveResult(result) {
    const history = JSON.parse(localStorage.getItem(RESULT_KEY) || '[]');
    history.unshift({ ...result, npm: state.user.npm, name: state.user.name, course: COURSE.slug });
    localStorage.setItem(RESULT_KEY, JSON.stringify(history.slice(0, 10)));
    const apiUrl = window.APP_CONFIG?.apiUrl;
    if (!apiUrl) return;
    fetch(apiUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ ...result, npm: state.user.npm, name: state.user.name, course: COURSE.title }) }).catch(() => showToast('Hasil lokal tersimpan; koneksi spreadsheet belum tersedia.', 'error'));
  }

  function renderResult() {
    const result = state.lastResult;
    if (!result) { setView('dashboard'); return; }
    const headline = result.score >= 80 ? 'You nailed it.' : result.score >= 60 ? 'Solid first run.' : 'Keep building.';
    $('#result-view').innerHTML = `<section class="result-page"><div class="result-glow"></div><p class="eyebrow">SESSION COMPLETE / ${formatDate(new Date(result.completedAt))}</p><h2>${headline}<span class="hero-dot">.</span></h2><p class="result-lead">Setiap baris kode yang kamu tulis adalah satu langkah lebih dekat menuju web yang kamu bayangkan.</p><div class="result-score-card"><div class="score-ring" style="--score:${result.score * 3.6}deg"><div><strong>${result.score}</strong><span>/ 100</span></div></div><div class="result-details"><span class="eyebrow">YOUR SIGNAL</span><h3>${result.passedCount} dari ${result.total} challenge passed</h3><div class="result-metrics"><span><strong>${formatDuration(result.durationSeconds)}</strong><small>active elapsed time</small></span><span><strong>${result.score >= 80 ? 'A' : result.score >= 60 ? 'B' : 'C'}</strong><small>skill signal</small></span></div></div></div><div class="result-actions"><button class="primary-button" data-action="retry">Try another run <span>↗</span></button><button class="secondary-button" data-action="home">Back to overview</button></div><p class="result-note"><span>✦</span> Hasil ini sudah tersimpan di progress lokal kamu${window.APP_CONFIG?.apiUrl ? ' dan dikirim ke learning database.' : '.'}</p></section>`;
    $('#result-view [data-action="retry"]').addEventListener('click', () => { state.questionOrder = []; state.finishedAt = null; state.lastResult = null; persist(); startExam(); });
    $('#result-view [data-action="home"]').addEventListener('click', () => setView('dashboard'));
    launchConfetti();
  }

  function launchConfetti() {
    const container = $('#confetti');
    container.innerHTML = Array.from({ length: 34 }, (_, index) => `<i style="--x:${Math.random() * 100}%;--delay:${Math.random() * 1.2}s;--hue:${index * 29}"></i>`).join('');
    window.setTimeout(() => { container.innerHTML = ''; }, 3600);
  }

  $('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const npm = $('#npm').value.trim();
    const name = $('#student-name').value.trim();
    if (npm.length < 3 || name.length < 2) { showToast('Isi NPM dan nama lengkap terlebih dahulu.', 'error'); return; }
    const user = { npm, name };
    const sameStudent = state.user && profileKey(state.user) === profileKey(user);
    if (!sameStudent) state = loadProfile(user) || createDefaultState(user);
    state.user = user;
    state.view = 'dashboard';
    persist();
    renderShell();
  });

  $('#logout-button').addEventListener('click', () => {
    stopTimer();
    state = createDefaultState();
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    renderShell();
  });

  $$('.nav-item').forEach((item) => item.addEventListener('click', () => {
    if (item.dataset.view === 'exam' && !hasCurrentExam()) setView('exam');
    else setView(item.dataset.view);
  }));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (state.user && state.view === 'exam' && state.questionOrder.length && !state.finishedAt) startTimer();
  });
  window.addEventListener('pagehide', stopTimer);
  window.addEventListener('beforeunload', stopTimer);

  renderShell();
})();
