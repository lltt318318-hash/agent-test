(() => {
  const app = document.querySelector('#app');
  const storageKey = 'zhilian-practice-records-v1';
  const draftKey = 'zhilian-practice-drafts-v1';
  const questionBankVersion = '2026-09-06-ab-source-v2';
  let session = null;

  const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
  const typeNames = { single: '单选题', multiple: '多选题', judge: '判断题' };
  const typePoints = { single: 2, multiple: 2, judge: 1 };
  const optionLetter = (index) => String.fromCharCode(65 + index);

  function records() {
    try { return (JSON.parse(localStorage.getItem(storageKey)) || []).filter((record) => record.questionBankVersion === questionBankVersion); } catch { return []; }
  }
  function saveRecord(record) {
    localStorage.setItem(storageKey, JSON.stringify([record, ...records()].slice(0, 10)));
  }
  function drafts() {
    try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch { return {}; }
  }
  function saveDraft() {
    if (!session) return;
    const allDrafts = drafts();
    allDrafts[session.paper.id] = {
      paperId: session.paper.id,
      questionBankVersion,
      questions: session.questions,
      index: session.index,
      answers: session.answers,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(draftKey, JSON.stringify(allDrafts));
  }
  function removeDraft(paperId) {
    const allDrafts = drafts();
    delete allDrafts[paperId];
    localStorage.setItem(draftKey, JSON.stringify(allDrafts));
  }
  function completedCount(paper) { return paper.questions.filter((q) => q.ready).length; }
  function typeCount(paper, type) { return paper.questions.filter((q) => q.type === type).length; }
  function formatDate(iso) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }

  function renderHome() {
    const recent = records();
    const allDrafts = drafts();
    app.innerHTML = `
      <section class="page">
        <div class="paper-grid">
          ${PAPERS.map((paper, index) => `
            <article class="paper-card">
              <div class="card-label">赛前练习 ${index + 1}</div>
              <h2>${paper.title}</h2>
              <p>理论分 100 分 · 共 60 题</p>
              <div class="paper-stat"><span>单选 30 题 / 60 分</span><span>多选 10 题 / 20 分</span><span>判断 20 题 / 20 分</span></div>
              <div class="button-row">${allDrafts[paper.id]?.questionBankVersion === questionBankVersion ? `<button class="button" data-resume="${paper.id}">继续练习</button><button class="button secondary" data-restart="${paper.id}">重新开始</button>` : `<button class="button" data-start="${paper.id}">开始练习</button>`}</div>
            </article>`).join('')}
        </div>
        <div class="notice">两套试卷均已完整录入：每套 60 题，满分 100 分。</div>
        <section class="record-section">
          <h2>最近 10 次练习</h2>
          ${recent.length ? `<div class="record-table-wrap"><table class="record-table"><thead><tr><th>试卷</th><th>得分</th><th>正确题数</th><th>错题数</th><th>作答时间</th><th>操作</th></tr></thead><tbody>${recent.map((r, index) => `<tr><td>${r.paperTitle}</td><td class="score-good">${r.score} / ${r.total}</td><td>${r.correct} / ${r.graded}</td><td>${r.wrongCount ?? Math.max(0, (r.graded || 0) - (r.correct || 0))}</td><td>${formatDate(r.finishedAt)}</td><td>${r.items ? `<button class="button table-button" data-view-record="${index}">查看错题</button>` : '<span class="muted">暂无详情</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="record-empty">还没有练习记录。完成一套试卷后，成绩会保存在这里。</div>'}
        </section>
      </section>`;
    app.querySelectorAll('[data-start]').forEach((button) => button.addEventListener('click', () => startPaper(button.dataset.start)));
    app.querySelectorAll('[data-resume]').forEach((button) => button.addEventListener('click', () => resumePaper(button.dataset.resume)));
    app.querySelectorAll('[data-restart]').forEach((button) => button.addEventListener('click', () => { removeDraft(button.dataset.restart); startPaper(button.dataset.restart); }));
    app.querySelectorAll('[data-view-record]').forEach((button) => button.addEventListener('click', () => {
      const record = recent[Number(button.dataset.viewRecord)];
      renderResult(record, record.items || [], true);
    }));
  }

  function startPaper(paperId) {
    const paper = PAPERS.find((item) => item.id === paperId);
    const questionOrder = ['single', 'multiple', 'judge'].flatMap((type) => shuffle(paper.questions.filter((q) => q.type === type)).map((q) => ({
      ...q,
      options: q.options ? (q.type === 'judge' ? q.options.map((option) => ({ ...option })) : shuffle(q.options.map((option) => ({ ...option })))) : []
    })));
    session = { paper, questions: questionOrder, index: 0, answers: {} };
    saveDraft();
    renderQuiz();
  }

  function resumePaper(paperId) {
    const paper = PAPERS.find((item) => item.id === paperId);
    const draft = drafts()[paperId];
    if (!paper || !draft || draft.questionBankVersion !== questionBankVersion) {
      removeDraft(paperId);
      return startPaper(paperId);
    }
    session = {
      paper,
      questions: draft.questions,
      index: Math.min(Math.max(Number(draft.index) || 0, 0), draft.questions.length - 1),
      answers: draft.answers || {}
    };
    renderQuiz();
  }

  function answerFor(question) { return session.answers[question.id] || []; }
  function setAnswer(question, values) { session.answers[question.id] = values; saveDraft(); renderQuiz(); }
  function renderQuiz() {
    const question = session.questions[session.index];
    const answered = Object.values(session.answers).filter((values) => values.length).length;
    const progress = Math.round((answered / session.questions.length) * 100);
    const selected = answerFor(question);
    const inputType = question.type === 'multiple' ? 'checkbox' : 'radio';
    const content = question.ready ? `<div class="options">${question.options.map((option, index) => {
      const checked = selected.includes(option.id);
      return `<label class="option ${checked ? 'selected' : ''}"><input type="${inputType}" name="choice" value="${option.id}" ${checked ? 'checked' : ''}><span class="option-key">${optionLetter(index)}</span><span>${option.text}</span></label>`;
    }).join('')}</div>` : '<div class="empty-question">这道题的题干或选项未包含在当前资料中，等待补充后即可参与练习与评分。</div>';
    app.innerHTML = `
      <section class="quiz-page">
        <div class="quiz-top"><div><p class="eyebrow">${session.paper.title}</p><h1 class="quiz-title">顺序练习</h1></div><div class="quiz-info">已作答 ${answered} / ${session.questions.length}</div></div>
        <div class="progress-shell" aria-label="答题进度"><div class="progress-bar" style="width:${progress}%"></div></div>
        <div class="quiz-layout">
          <article class="question-panel">
            <span class="question-type">${typeNames[question.type]} · ${typePoints[question.type]} 分</span>
            <div class="question-text">${question.text}</div>
            ${content}
            <div class="question-actions"><button class="button secondary" data-exit>保存并返回</button><span class="question-nav"><button class="button secondary" data-prev ${session.index === 0 ? 'disabled' : ''}>上一题</button>${session.index === session.questions.length - 1 ? '<button class="button warning" data-submit>交卷评分</button>' : '<button class="button" data-next>下一题</button>'}</span></div>
          </article>
        </div>
      </section>`;
    app.querySelectorAll('input[name="choice"]').forEach((input) => input.addEventListener('change', (event) => {
      if (question.type === 'multiple') {
        const values = selected.filter((id) => id !== event.target.value);
        if (event.target.checked) values.push(event.target.value);
        setAnswer(question, values);
      } else { setAnswer(question, [event.target.value]); }
    }));
    app.querySelector('[data-exit]')?.addEventListener('click', () => { saveDraft(); session = null; renderHome(); });
    app.querySelector('[data-prev]')?.addEventListener('click', () => { session.index--; saveDraft(); renderQuiz(); });
    app.querySelector('[data-next]')?.addEventListener('click', () => { session.index++; saveDraft(); renderQuiz(); });
    app.querySelector('[data-submit]')?.addEventListener('click', submitPaper);
  }

  function submitPaper() {
    const graded = session.questions.filter((q) => q.ready);
    const details = graded.map((q) => {
      const choice = answerFor(q);
      const correct = q.answer.length === choice.length && q.answer.every((id) => choice.includes(id));
      return { question: q, choice, correct };
    });
    const score = details.reduce((sum, item) => sum + (item.correct ? typePoints[item.question.type] : 0), 0);
    const total = graded.reduce((sum, q) => sum + typePoints[q.type], 0);
    const correct = details.filter((item) => item.correct).length;
    const items = details.map(({ question, choice, correct: isCorrect }) => ({
      question: { ...question, options: question.options.map((option) => ({ ...option })) },
      choice,
      correct: isCorrect
    }));
    const record = { paperTitle: session.paper.title, score, total, correct, graded: graded.length, wrongCount: details.length - correct, finishedAt: new Date().toISOString(), questionBankVersion, items };
    saveRecord(record);
    removeDraft(session.paper.id);
    renderResult(record, details);
  }

  function responseText(question, ids) { return ids.length ? ids.map((id) => question.options.find((option) => option.id === id)?.text).join('；') : '未作答'; }
  function renderResult(record, details, historyOnly = false) {
    const wrongOnly = historyOnly ? details.filter((item) => !item.correct) : details;
    const typeSummary = ['single', 'multiple', 'judge'].map((type) => {
      const list = details.filter((item) => item.question.type === type);
      const got = list.reduce((sum, item) => sum + (item.correct ? typePoints[type] : 0), 0);
      return `<div><b>${got} / ${list.length * typePoints[type]}</b><span>${typeNames[type]} (${list.filter((item) => item.correct).length}/${list.length})</span></div>`;
    }).join('');
    app.innerHTML = `<section class="page"><section class="result-hero"><div class="result-grid"><div class="score-circle"><div><strong>${record.score}</strong><span>有效得分 / ${record.total}</span></div></div><div class="result-meta"><p class="eyebrow">${record.paperTitle}</p><h1>${historyOnly ? '错题回顾' : '本次练习已完成'}</h1><p>${historyOnly ? `本次共 ${record.wrongCount || 0} 道错题，下面显示每道题的解析。` : `答对 ${record.correct} 题，共参与评分 ${record.graded} 题。成绩已保存在当前浏览器。`}</p><div class="button-row"><button class="button secondary" data-retry>再练一次</button><button class="button" data-home>返回练习列表</button></div></div></div></section>${historyOnly ? '' : `<div class="review-tabs"><button class="tab active" data-filter="all">全部题目</button><button class="tab" data-filter="wrong">仅看错题 (${record.wrongCount || 0})</button></div>`}<div class="breakdown">${typeSummary}</div><section class="answer-review"><h2>${historyOnly ? '错题与解析' : '答案回顾'}</h2><div data-review-list>${(historyOnly ? wrongOnly : details).map(({ question, choice, correct }) => reviewHtml(question, choice, correct)).join('')}</div></section></section>`;
    app.querySelector('[data-home]').addEventListener('click', renderHome);
    app.querySelector('[data-retry]').addEventListener('click', () => startPaper(PAPERS.find((paper) => paper.title === record.paperTitle)?.id || session?.paper?.id));
    app.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      app.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
      const list = button.dataset.filter === 'wrong' ? details.filter((item) => !item.correct) : details;
      app.querySelector('[data-review-list]').innerHTML = list.map(({ question, choice, correct }) => reviewHtml(question, choice, correct)).join('') || '<div class="record-empty">这次没有错题，继续保持。</div>';
    }));
  }

  function reviewHtml(question, choice, correct) {
    return `<article class="review-item"><h3>${typeNames[question.type]} · ${question.text}</h3><div class="review-answer ${correct ? 'correct' : 'wrong'}">你的答案：${responseText(question, choice)}${correct ? ' · 正确' : ' · 不正确'}</div><div class="review-answer correct">正确答案：${responseText(question, question.answer)}</div><div class="review-explanation"><b>解析</b><span>${question.explanation || '该题解析待补充。'}</span></div></article>`;
  }

  document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); session = null; renderHome(); });
  renderHome();
})();
