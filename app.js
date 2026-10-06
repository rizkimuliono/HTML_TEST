(function () {
  'use strict';

  const COURSE = window.COURSE;
  const STORAGE_KEY = 'htmllab-state-v1';
  const RESULT_KEY = 'htmllab-results-v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const defaultState = {
    user: null,
    view: 'dashboard',
    selectedModule: COURSE.modules[0].id,
    viewedModules: [],
    questionOrder: [],
    currentIndex: 0,
    answers: {},
    feedback: {},
    startedAt: null,
    finishedAt: null,
    lastResult: null
  };

  let state = loadState();
  let timerHandle = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved ? { ...defaultState, ...saved } : { ...defaultState };
    } catch (error) {
      return { ...defaultState };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
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
    const hasExam = state.questionOrder.length > 0 && !state.finishedAt;
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
        <div class="stat-card"><div class="stat-icon violet">⌁</div><div><span class="stat-label">Total challenges</span><strong>20<small> soal</small></strong><span class="stat-sub">Coding based</span></div></div>
        <div class="stat-card"><div class="stat-icon lime">◉</div><div><span class="stat-label">Last score</span><strong>${state.lastResult ? completed : '--'}<small>${state.lastResult ? '/ 100' : ' belum ada'}</small></strong><span class="stat-sub">${state.lastResult ? formatDate(new Date(state.lastResult.completedAt)) : 'Your first run awaits'}</span></div></div>
      </section>

      <section class="section-heading"><div><p class="eyebrow">THE CURRICULUM</p><h3>Map your learning path</h3></div><button class="text-button" data-view="lesson">Lihat semua <span>→</span></button></section>
      <section class="module-grid">${COURSE.modules.map((module, index) => {
        const isViewed = state.viewedModules.includes(module.id);
        return `<button class="module-card ${isViewed ? 'is-complete' : ''}" data-module="${module.id}"><div class="module-card-top"><span class="module-number">${module.number}</span><span class="module-icon">${module.icon}</span></div><h4>${module.title}</h4><p>${module.description}</p><div class="module-card-foot"><span>${isViewed ? 'Explored' : `${index === 0 ? 'Start here' : 'Next step'}`}</span><span class="module-arrow">↗</span></div></button>`;
      }).join('')}</section>

      <section class="bottom-rail"><div class="quote-card"><span class="quote-mark">“</span><p>The web is not a collection of pages. It is a conversation.</p><span class="quote-author">— HTML LAB / FIELD NOTE 001</span></div><div class="challenge-card"><div><p class="eyebrow">PRACTICE ZONE</p><h3>${hasExam ? 'Your challenge is in progress' : '20 prompts. 1 skill stack.'}</h3><p>Lengkapi kode, cek jawaban, dan lihat sejauh mana skill kamu berkembang.</p></div><span class="challenge-orb">✦</span></div></section>
    `;
    bindDashboardEvents();
  }

  function bindDashboardEvents() {
    $('[data-action="start-learning"]')?.addEventListener('click', () => {
      if (state.questionOrder.length > 0 && !state.finishedAt) setView('exam');
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
      <section class="page-intro"><div><p class="eyebrow">LEARNING PATH / ${activeModule.number}</p><h2>${activeModule.title}<span class="hero-dot">.</span></h2><p>${activeModule.description} Pelajari konsepnya, lalu uji dengan prompt di akhir perjalanan.</p></div><div class="lesson-progress"><span>MODULE ${activeModule.number} / 04</span><strong>${Math.round((state.viewedModules.length / COURSE.modules.length) * 100)}%</strong><div class="progress-line"><span style="width:${Math.round((state.viewedModules.length / COURSE.modules.length) * 100)}%"></span></div></div></section>
      <div class="module-tabs">${COURSE.modules.map((module) => `<button class="module-tab ${module.id === activeModule.id ? 'active' : ''}" data-module-tab="${module.id}"><span>${module.number}</span>${module.title}</button>`).join('')}</div>
      <section class="lesson-layout"><div class="lesson-main"><div class="lesson-banner"><span class="big-module-icon">${activeModule.icon}</span><div><p class="eyebrow">CONCEPT DROP</p><h3>${activeModule.title}</h3><p>${activeModule.description}</p></div></div><div class="concept-list">${moduleQuestions.map((question, index) => `<article class="concept-card"><div class="concept-index">0${index + 1}</div><div class="concept-body"><span class="concept-tag">${question.lessonTitle}</span><p>${question.lessonBody}</p><div class="lesson-code"><div class="code-window-head"><span class="window-dots"><i></i><i></i><i></i></span><span>snippet.html</span></div><pre><code>${escapeHtml(question.lessonCode)}</code></pre></div></div></article>`).join('')}</div></div><aside class="lesson-aside"><div class="aside-sticky"><p class="eyebrow">CHECKPOINT</p><h3>Ready to<br /><em>test your flow?</em></h3><p>${moduleQuestions.length} challenge dari modul ini menunggumu di dalam ujian utama.</p><div class="checkpoint-count"><strong>${moduleQuestions.length}</strong><span>coding prompts</span></div><button class="primary-button full-button" data-action="start-exam">Go to challenge <span>↗</span></button></div></aside></section>
    `;
    $$('[data-module-tab]').forEach((tab) => tab.addEventListener('click', () => { state.selectedModule = tab.dataset.moduleTab; renderLesson(); }));
    $('[data-action="start-exam"]').addEventListener('click', () => startExam());
  }

  function startExam() {
    if (!state.questionOrder.length || state.finishedAt) {
      state.questionOrder = shuffle(COURSE.questions.map((question) => question.id));
      state.currentIndex = 0;
      state.answers = {};
      state.feedback = {};
      state.startedAt = Date.now();
      state.finishedAt = null;
      state.lastResult = null;
      persist();
    }
    setView('exam');
  }

  function currentQuestion() {
    const questionId = state.questionOrder[state.currentIndex];
    return COURSE.questions.find((question) => question.id === questionId) || COURSE.questions[0];
  }

  function validateQuestion(question, answer = '') {
    const normalized = normalize(answer);
    const passed = question.required.every((pattern) => new RegExp(pattern, 'i').test(normalized));
    return { passed, message: passed ? 'Nice. Struktur kodenya sudah sesuai.' : 'Belum pas. Cek kembali tag dan atribut yang diminta.' };
  }

  function renderExam() {
    if (!state.questionOrder.length || state.finishedAt) {
      $('#exam-view').innerHTML = '<div class="empty-state"><span>✦</span><h2>Your challenge awaits.</h2><p>Mulai ujian untuk mendapatkan 20 prompt HTML yang diacak.</p><button class="primary-button" data-action="begin">Begin challenge ↗</button></div>';
      $('[data-action="begin"]').addEventListener('click', startExam);
      return;
    }
    const question = currentQuestion();
    const feedback = state.feedback[question.id];
    const progress = Math.round(((state.currentIndex + 1) / state.questionOrder.length) * 100);
    $('#exam-view').innerHTML = `
      <section class="exam-topline"><div><p class="eyebrow">HTML CHALLENGE / LIVE SESSION</p><h2>Complete the layer<span class="hero-dot">.</span></h2></div><div class="exam-clock"><span class="clock-icon">◷</span><div><span>ELAPSED TIME</span><strong id="elapsed-time">${formatDuration((Date.now() - state.startedAt) / 1000)}</strong></div></div></section>
      <div class="exam-progress-row"><span>CHALLENGE <strong>${String(state.currentIndex + 1).padStart(2, '0')}</strong> / ${String(state.questionOrder.length).padStart(2, '0')}</span><span>${progress}% complete</span></div><div class="exam-progress"><span style="width:${progress}%"></span></div>
      <section class="exam-grid"><div class="lesson-panel"><div class="panel-label"><span class="label-dot"></span> BEFORE YOU CODE <span class="panel-module">${COURSE.modules.find((module) => module.id === question.module)?.title || 'HTML'}</span></div><h3>${question.lessonTitle}</h3><p>${question.lessonBody}</p><div class="lesson-code large"><div class="code-window-head"><span class="window-dots"><i></i><i></i><i></i></span><span>concept.html</span><span class="code-lang">READ</span></div><pre><code>${escapeHtml(question.lessonCode)}</code></pre></div><div class="insight"><span>✦</span><span><strong>Quick insight</strong>${question.hint}</span></div></div><div class="question-panel"><div class="question-number">Q${String(state.currentIndex + 1).padStart(2, '0')} <span>of ${String(state.questionOrder.length).padStart(2, '0')}</span></div><h3>${question.title}</h3><p class="question-prompt">${question.prompt}</p><div class="editor-shell ${feedback ? (feedback.passed ? 'passed' : 'failed') : ''}"><div class="editor-head"><span><i></i> answer.html</span><span>HTML</span></div><textarea id="answer-editor" spellcheck="false" aria-label="Kode jawaban">${escapeHtml(state.answers[question.id] || question.starter)}</textarea><div class="editor-foot"><span>⌘ + Enter to check</span><button id="check-answer" class="check-button">Check code <span>↗</span></button></div></div>${feedback ? `<div class="feedback ${feedback.passed ? 'success' : 'error'}"><span>${feedback.passed ? '✓' : '!'}</span><div><strong>${feedback.passed ? 'Looks good!' : 'Keep iterating'}</strong><p>${feedback.message}</p></div></div>` : ''}<div class="question-actions"><button id="prev-question" class="secondary-button" ${state.currentIndex === 0 ? 'disabled' : ''}>← Previous</button><button id="next-question" class="primary-button">${state.currentIndex === state.questionOrder.length - 1 ? 'Finish test' : 'Next prompt'} <span>→</span></button></div></div></section>
    `;
    bindExamEvents(question);
    startTimer();
  }

  function bindExamEvents(question) {
    const editor = $('#answer-editor');
    editor.addEventListener('input', () => { state.answers[question.id] = editor.value; persist(); });
    editor.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); checkAnswer(question); }
      if (event.key === 'Tab') { event.preventDefault(); const start = editor.selectionStart; editor.value = `${editor.value.slice(0, start)}  ${editor.value.slice(editor.selectionEnd)}`; editor.selectionStart = editor.selectionEnd = start + 2; state.answers[question.id] = editor.value; }
    });
    $('#check-answer').addEventListener('click', () => checkAnswer(question));
    $('#prev-question').addEventListener('click', () => { if (state.currentIndex > 0) { state.currentIndex -= 1; persist(); renderExam(); } });
    $('#next-question').addEventListener('click', () => {
      const result = validateQuestion(question, state.answers[question.id] || editor.value);
      state.answers[question.id] = editor.value;
      state.feedback[question.id] = result;
      persist();
      if (!result.passed) { renderExam(); showToast('Coba cek lagi kode kamu.', 'error'); return; }
      if (state.currentIndex === state.questionOrder.length - 1) finishExam();
      else { state.currentIndex += 1; persist(); renderExam(); }
    });
  }

  function checkAnswer(question) {
    const editor = $('#answer-editor');
    state.answers[question.id] = editor.value;
    state.feedback[question.id] = validateQuestion(question, editor.value);
    persist();
    renderExam();
    showToast(state.feedback[question.id].passed ? 'Jawaban benar. Keep going!' : 'Belum pas, coba lagi.', state.feedback[question.id].passed ? 'success' : 'error');
  }

  function startTimer() {
    stopTimer();
    timerHandle = window.setInterval(() => {
      const element = $('#elapsed-time');
      if (element && state.startedAt) element.textContent = formatDuration((Date.now() - state.startedAt) / 1000);
    }, 1000);
  }

  function stopTimer() {
    if (timerHandle) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function finishExam() {
    stopTimer();
    const passedCount = COURSE.questions.filter((question) => validateQuestion(question, state.answers[question.id] || '').passed).length;
    const durationSeconds = Math.round((Date.now() - state.startedAt) / 1000);
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
    $('#result-view').innerHTML = `<section class="result-page"><div class="result-glow"></div><p class="eyebrow">SESSION COMPLETE / ${formatDate(new Date(result.completedAt))}</p><h2>${headline}<span class="hero-dot">.</span></h2><p class="result-lead">Setiap baris kode yang kamu tulis adalah satu langkah lebih dekat menuju web yang kamu bayangkan.</p><div class="result-score-card"><div class="score-ring" style="--score:${result.score * 3.6}deg"><div><strong>${result.score}</strong><span>/ 100</span></div></div><div class="result-details"><span class="eyebrow">YOUR SIGNAL</span><h3>${result.passedCount} dari ${result.total} challenge passed</h3><div class="result-metrics"><span><strong>${formatDuration(result.durationSeconds)}</strong><small>elapsed time</small></span><span><strong>${result.score >= 80 ? 'A' : result.score >= 60 ? 'B' : 'C'}</strong><small>skill signal</small></span></div></div></div><div class="result-actions"><button class="primary-button" data-action="retry">Try another run <span>↗</span></button><button class="secondary-button" data-action="home">Back to overview</button></div><p class="result-note"><span>✦</span> Hasil ini sudah tersimpan di progress lokal kamu${window.APP_CONFIG?.apiUrl ? ' dan dikirim ke learning database.' : '.'}</p></section>`;
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
    const isNewStudent = state.user && (state.user.npm !== npm || state.user.name !== name);
    if (isNewStudent) {
      state.viewedModules = [];
      state.questionOrder = [];
      state.currentIndex = 0;
      state.answers = {};
      state.feedback = {};
      state.startedAt = null;
      state.finishedAt = null;
      state.lastResult = null;
    }
    state.user = { npm, name };
    state.view = 'dashboard';
    persist();
    renderShell();
  });

  $('#logout-button').addEventListener('click', () => {
    stopTimer();
    state = { ...defaultState };
    persist();
    renderShell();
  });

  $$('.nav-item').forEach((item) => item.addEventListener('click', () => {
    if (item.dataset.view === 'exam' && !state.questionOrder.length) setView('exam');
    else setView(item.dataset.view);
  }));

  renderShell();
})();
