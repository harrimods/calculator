(function(){
  const inputEl = document.getElementById('mathInput');
  const solveBtn = document.getElementById('solveBtn');
  const resultContent = document.getElementById('resultContent');
  const detectionBadge = document.getElementById('detectionBadge');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const HISTORY_KEY = 'mathSolverHistory';
  const MAX_HISTORY = 20;

  // ---------- HISTORY (JSON in localStorage) ----------
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // storage full or unavailable — fail silently
    }
  }

  function addToHistory(entry) {
    const history = loadHistory();
    // avoid duplicate consecutive entries
    if (history.length && history[0].input === entry.input && history[0].answer === entry.answer) {
      return;
    }
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    saveHistory(history);
    renderHistory();
  }

  function renderHistory() {
    if (!historyList) return;
    const history = loadHistory();
    if (!history.length) {
      historyList.innerHTML = '<div class="history-empty">No history yet.</div>';
      return;
    }
    historyList.innerHTML = history.map((h, i) => `
      <button class="history-item" data-index="${i}" title="Click to reload">
        <span class="history-input">${escapeHtml(h.input)}</span>
        <span class="history-answer">${escapeHtml(h.answer)}</span>
      </button>
    `).join('');

    historyList.querySelectorAll('.history-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const hist = loadHistory();
        if (hist[idx]) {
          inputEl.value = hist[idx].input;
          solve();
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearHistory() {
    saveHistory([]);
    renderHistory();
  }

  // ---------- helper: clean & normalize input ----------
  function normalizeInput(raw) {
    let s = raw.trim();
    if (!s) return '';
    s = s.replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4');
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/–/g, '-');
    s = s.replace(/,/g, '.');
    s = s.replace(/\s+/g, '');
    return s;
  }

  // ---------- SAFE EVALUATION of arithmetic ----------
  function evaluateArithmetic(expr, allowTrig = true) {
    let s = expr;

    if (!/(sin|cos|tan)\s*\(/i.test(s)) {
      if (!/^[0-9+\-*/().^]+$/.test(s)) throw new Error('Invalid characters in arithmetic expression');
      let jsExpr = s.replace(/\^/g, '**');
      if (/[a-zA-Z]/.test(jsExpr)) throw new Error('Variables not allowed');
      try {
        const fn = new Function('return (' + jsExpr + ');');
        const val = fn();
        if (typeof val !== 'number' || !isFinite(val)) throw new Error('Result not finite');
        return Math.round(val * 1e12) / 1e12;
      } catch (e) {
        throw new Error('Cannot evaluate arithmetic expression');
      }
    }

    let maxIter = 50;
    while (/(sin|cos|tan)\s*\(/i.test(s) && maxIter-- > 0) {
      const match = s.match(/(sin|cos|tan)\s*\(([^()]*)\)/i);
      if (!match) break;
      const fullMatch = match[0];
      const func = match[1].toLowerCase();
      const argStr = match[2];

      let argVal;
      try {
        argVal = evaluateArithmetic(argStr, false);
      } catch (e) {
        throw new Error('Invalid argument for ' + func + '()');
      }

      const rad = argVal * Math.PI / 180;
      let result;
      if (func === 'sin') result = Math.sin(rad);
      else if (func === 'cos') result = Math.cos(rad);
      else if (func === 'tan') {
        const cosVal = Math.cos(rad);
        if (Math.abs(cosVal) < 1e-12) throw new Error('tan undefined (angle is 90° or 270° etc.)');
        result = Math.tan(rad);
      }
      const replacement = result.toFixed(12).replace(/\.?0+$/, '') || '0';
      s = s.replace(fullMatch, replacement);
    }

    if (/(sin|cos|tan)/i.test(s)) throw new Error('Could not resolve trig functions (nested too deep?)');
    let jsExpr = s.replace(/\^/g, '**');
    if (!/^[0-9+\-*/().* ]+$/.test(jsExpr)) throw new Error('Invalid characters after trig substitution');
    try {
      const fn = new Function('return (' + jsExpr + ');');
      const val = fn();
      if (typeof val !== 'number' || !isFinite(val)) throw new Error('Result not finite');
      return Math.round(val * 1e12) / 1e12;
    } catch (e) {
      throw new Error('Cannot evaluate arithmetic expression');
    }
  }

  // ---------- EVALUATION with variable x ----------
  function evalWithX(expr, xVal) {
    let s = expr.replace(/\^/g, '**');
    s = s.replace(/(\d)(x)/g, '$1*$2');
    s = s.replace(/(x)\(/g, '$1*(');
    s = s.replace(/\)(x)/g, ')*$1');
    s = s.replace(/\)\(/g, ')*(');
    s = s.replace(/(\d)\(/g, '$1*(');
    s = s.replace(/x/g, '(' + xVal + ')');

    let maxIter = 30;
    while (/(sin|cos|tan)\s*\(/i.test(s) && maxIter-- > 0) {
      const match = s.match(/(sin|cos|tan)\s*\(([^()]*)\)/i);
      if (!match) break;
      const fullMatch = match[0];
      const func = match[1].toLowerCase();
      const argStr = match[2];
      let argVal;
      try {
        argVal = evaluateArithmetic(argStr, false);
      } catch (e) {
        throw new Error('Invalid trig argument');
      }
      const rad = argVal * Math.PI / 180;
      let result;
      if (func === 'sin') result = Math.sin(rad);
      else if (func === 'cos') result = Math.cos(rad);
      else if (func === 'tan') {
        if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error('tan undefined');
        result = Math.tan(rad);
      }
      const replacement = result.toFixed(12).replace(/\.?0+$/, '') || '0';
      s = s.replace(fullMatch, replacement);
    }

    if (/(sin|cos|tan)/i.test(s)) throw new Error('Could not resolve trig in expression');
    if (!/^[0-9+\-*/().* ]+$/.test(s)) throw new Error('Invalid characters in expression after substitution');
    try {
      const fn = new Function('return (' + s + ');');
      const val = fn();
      if (typeof val !== 'number' || !isFinite(val)) throw new Error('Evaluation failed');
      return val;
    } catch (e) {
      throw new Error('Cannot evaluate expression with x');
    }
  }

  // ---------- solve polynomial equation using sampling ----------
  function solvePolynomialEquation(lhs, rhs) {
    const f = (x) => {
      let leftVal, rightVal;
      try { leftVal = evalWithX(lhs, x); } catch(e) { throw new Error('Left side parse error: ' + e.message); }
      try { rightVal = evalWithX(rhs, x); } catch(e) { throw new Error('Right side parse error: ' + e.message); }
      return leftVal - rightVal;
    };

    const xs = [-2, -1, 0, 1, 2];
    let ys = [];
    for (let x of xs) {
      try {
        let y = f(x);
        if (!isFinite(y)) throw new Error('Sampling produced infinite value');
        ys.push(y);
      } catch (e) {
        throw new Error('Equation contains unsupported operation or division by zero');
      }
    }

    const n = xs.length;
    let sumx2 = 0, sumx4 = 0, sumy = 0, sumxy = 0, sumx2y = 0;
    for (let i=0; i<n; i++) {
      const x = xs[i], y = ys[i];
      sumx2 += x*x;
      sumx4 += x*x*x*x;
      sumy += y;
      sumxy += x*y;
      sumx2y += x*x*y;
    }
    const det = sumx4 * n - sumx2 * sumx2;
    let a=0, b=0, c=0;
    if (Math.abs(det) < 1e-12) {
      if (Math.abs(sumx2) > 1e-12) {
        b = sumxy / sumx2;
        c = sumy / n;
        a = 0;
      } else {
        a = 0; b = 0; c = sumy / n;
      }
    } else {
      a = (sumx2y * n - sumx2 * sumy) / det;
      c = (sumx4 * sumy - sumx2 * sumx2y) / det;
      if (Math.abs(sumx2) > 1e-12) b = sumxy / sumx2;
      else b = 0;
    }

    const eps = 1e-10;
    if (Math.abs(a) < eps) a = 0;
    if (Math.abs(b) < eps) b = 0;
    if (Math.abs(c) < eps) c = 0;

    let steps = [];
    steps.push(`Equation: ${lhs} = ${rhs}`);
    steps.push(`Bring all terms to one side: f(x) = (${lhs}) - (${rhs}) = 0`);
    if (Math.abs(a) > eps) {
      steps.push(`Expanded form: ${a}x² + ${b}x + ${c} = 0`);
      const disc = b*b - 4*a*c;
      steps.push(`Discriminant Δ = b² - 4ac = ${b}² - 4·${a}·${c} = ${disc}`);
      if (disc < -eps) {
        return { type: 'quadratic', roots: [], message: 'No real roots', steps };
      } else if (Math.abs(disc) < eps) {
        const root = -b / (2*a);
        steps.push(`Δ = 0 → double root: x = -b/(2a) = ${-b}/(2·${a}) = ${root}`);
        return { type: 'quadratic', roots: [root], message: 'Double root', steps };
      } else {
        const sqrtDisc = Math.sqrt(disc);
        const root1 = (-b + sqrtDisc) / (2*a);
        const root2 = (-b - sqrtDisc) / (2*a);
        const roots = [root1, root2].sort((u,v)=>u-v);
        steps.push(`Δ > 0 → two real roots:`);
        steps.push(`x₁ = (-b + √Δ)/(2a) = (${-b} + ${sqrtDisc.toFixed(4)})/(${2*a}) = ${roots[0].toFixed(6)}`);
        steps.push(`x₂ = (-b - √Δ)/(2a) = (${-b} - ${sqrtDisc.toFixed(4)})/(${2*a}) = ${roots[1].toFixed(6)}`);
        return { type: 'quadratic', roots, message: 'Two real roots', steps };
      }
    } else if (Math.abs(b) > eps) {
      steps.push(`Linear form: ${b}x + ${c} = 0`);
      const root = -c / b;
      steps.push(`x = -c/b = ${-c} / ${b} = ${root}`);
      return { type: 'linear', roots: [root], message: 'Linear equation', steps };
    } else {
      if (Math.abs(c) < eps) {
        steps.push(`0 = 0 → identity, infinite solutions`);
        return { type: 'identity', roots: [], message: 'Infinite solutions', steps };
      } else {
        steps.push(`${c} = 0 → contradiction, no solution`);
        return { type: 'contradiction', roots: [], message: 'No solution', steps };
      }
    }
  }

  // ---------- Main solve ----------
  function solve() {
    let rawInput = inputEl.value.trim();
    if (!rawInput) {
      resultContent.innerHTML = 'Please enter an expression or equation.';
      detectionBadge.textContent = 'empty';
      return;
    }

    let input = normalizeInput(rawInput);
    if (!input) {
      resultContent.innerHTML = 'Please enter a valid expression.';
      detectionBadge.textContent = 'empty';
      return;
    }

    const eqIndex = input.indexOf('=');
    let isEquation = eqIndex !== -1;

    try {
      if (isEquation) {
        const lhs = input.slice(0, eqIndex).trim();
        const rhs = input.slice(eqIndex + 1).trim();
        if (!lhs || !rhs) throw new Error('Both sides of equation required');

        const hasVar = /x/.test(lhs) || /x/.test(rhs);
        if (!hasVar) {
          const leftVal = evaluateArithmetic(lhs);
          const rightVal = evaluateArithmetic(rhs);
          const equal = Math.abs(leftVal - rightVal) < 1e-9;
          detectionBadge.textContent = 'arithmetic';
          const steps = `Left side: ${lhs} = ${leftVal}\nRight side: ${rhs} = ${rightVal}\n${equal ? '✅ Both sides are equal.' : '❌ Sides are not equal.'}`;
          resultContent.innerHTML = `
            <span class="answer-line">${equal ? 'True' : 'False'}</span>
            <div class="steps">${steps}</div>
          `;
          addToHistory({ input: rawInput, answer: equal ? 'True' : 'False', type: 'arithmetic', timestamp: Date.now() });
          return;
        }

        const solution = solvePolynomialEquation(lhs, rhs);
        detectionBadge.textContent = solution.type;

        let answerLine = '';
        if (solution.type === 'linear') {
          const root = Math.round(solution.roots[0] * 1e10) / 1e10;
          answerLine = `x = ${root}`;
        } else if (solution.type === 'quadratic') {
          if (solution.roots.length === 0) answerLine = `No real roots`;
          else if (solution.roots.length === 1) answerLine = `x₁ = x₂ = ${Math.round(solution.roots[0]*1e10)/1e10}`;
          else {
            const r1 = Math.round(solution.roots[0]*1e10)/1e10;
            const r2 = Math.round(solution.roots[1]*1e10)/1e10;
            answerLine = `x₁ = ${r1} ,  x₂ = ${r2}`;
          }
        } else if (solution.type === 'identity') answerLine = 'Infinite solutions (identity)';
        else if (solution.type === 'contradiction') answerLine = 'No solution (contradiction)';
        else answerLine = 'Unable to classify';

        const stepsHtml = solution.steps ? `<div class="steps">${solution.steps.join('\n')}</div>` : '';
        resultContent.innerHTML = `<span class="answer-line">${answerLine}</span>${stepsHtml}`;

        addToHistory({ input: rawInput, answer: answerLine, type: solution.type, timestamp: Date.now() });

      } else {
        if (/[a-zA-Z]/.test(input) && !/(sin|cos|tan)/i.test(input)) {
          throw new Error('Variables require an equation (e.g., 2x+3=7)');
        }
        const val = evaluateArithmetic(input);
        const rounded = Math.round(val * 1e12) / 1e12;
        detectionBadge.textContent = 'arithmetic';

        let steps = [];
        if (/(sin|cos|tan)\s*\(/i.test(input)) {
          steps.push(`Trigonometric expression detected. Angles are in degrees.`);
          const trigMatches = input.match(/(sin|cos|tan)\s*\([^()]*\)/gi);
          if (trigMatches) {
            trigMatches.forEach(t => {
              try {
                const valT = evaluateArithmetic(t);
                steps.push(`${t} = ${valT.toFixed(6)}`);
              } catch(e) { /* ignore */ }
            });
          }
        }
        if (/\^/.test(input)) {
          steps.push(`Powers are evaluated first (order of operations).`);
        }
        steps.push(`Final result: ${input} = ${rounded}`);
        resultContent.innerHTML = `
          <span class="answer-line">${rounded}</span>
          <div class="steps">${steps.join('\n')}</div>
        `;

        addToHistory({ input: rawInput, answer: String(rounded), type: 'arithmetic', timestamp: Date.now() });
      }
    } catch (err) {
      detectionBadge.textContent = 'error';
      resultContent.innerHTML = `<span class="error-msg">⚠️ ${err.message}</span>`;
    }
  }

  solveBtn.addEventListener('click', solve);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      solve();
    }
  });

  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      inputEl.value = btn.dataset.ex;
      solve();
    });
  });

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }

  // Initial render of history
  renderHistory();
})();
