(function(){
  const inputEl = document.getElementById('mathInput');
  const solveBtn = document.getElementById('solveBtn');
  const resultContent = document.getElementById('resultContent');
  const detectionBadge = document.getElementById('detectionBadge');

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

  // ---------- SAFE EVALUATION of arithmetic (no variables, but includes trig & powers) ----------
  function evaluateArithmetic(expr, allowTrig = true) {
    // Only allow digits, operators, parentheses, dot, and trig function names
    // We'll replace trig functions with Math equivalents after converting degrees to radians
    let s = expr;

    // Handle trig functions: sin, cos, tan — input in DEGREES
    // We'll replace sin(30) with Math.sin(30 * Math.PI/180) but must be careful with nested parentheses.
    // Strategy: recursively replace innermost sin(...) with evaluated number (degree -> rad)
    // But easier: use a regex to replace simple patterns like sin(30) or sin(30.5) or sin(x) won't happen here
    // For general expressions with trig, we'll parse step by step.

    // If no trig functions, just evaluate directly after replacing ^ with **
    if (!/(sin|cos|tan)\s*\(/i.test(s)) {
      // validate characters
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

    // Has trig: recursively evaluate innermost trig calls
    // Find sin(...), cos(...), tan(...) with matching parentheses
    // We'll loop until no trig calls remain
    let maxIter = 50;
    while (/(sin|cos|tan)\s*\(/i.test(s) && maxIter-- > 0) {
      const match = s.match(/(sin|cos|tan)\s*\(([^()]*)\)/i);
      if (!match) break; // no simple innermost match, try deeper? We'll handle nested by finding innermost
      const fullMatch = match[0];
      const func = match[1].toLowerCase();
      const argStr = match[2];

      // evaluate argument as arithmetic (may contain ^, *, etc.)
      let argVal;
      try {
        argVal = evaluateArithmetic(argStr, false); // no trig inside argument (or could be, but we'll allow recursion)
      } catch (e) {
        // if argument evaluation fails, try to evaluate with trig? but we are in the trig replacement, so argument should be pure numeric
        throw new Error('Invalid argument for ' + func + '()');
      }

      // convert degrees to radians
      const rad = argVal * Math.PI / 180;
      let result;
      if (func === 'sin') result = Math.sin(rad);
      else if (func === 'cos') result = Math.cos(rad);
      else if (func === 'tan') {
        // check for undefined (cos near 0)
        const cosVal = Math.cos(rad);
        if (Math.abs(cosVal) < 1e-12) throw new Error('tan undefined (angle is 90° or 270° etc.)');
        result = Math.tan(rad);
      }
      // replace the matched part with the numeric result (formatted to avoid long decimals)
      const replacement = result.toFixed(12).replace(/\.?0+$/, '') || '0';
      s = s.replace(fullMatch, replacement);
    }

    // After trig replacement, evaluate remaining expression
    if (/(sin|cos|tan)/i.test(s)) throw new Error('Could not resolve trig functions (nested too deep?)');
    // replace ^ with **
    let jsExpr = s.replace(/\^/g, '**');
    // validate
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

  // ---------- EVALUATION with variable x (supports trig & powers) ----------
  function evalWithX(expr, xVal) {
    let s = expr.replace(/\^/g, '**');
    // insert multiplication for implicit multiplication
    s = s.replace(/(\d)(x)/g, '$1*$2');
    s = s.replace(/(x)\(/g, '$1*(');
    s = s.replace(/\)(x)/g, ')*$1');
    s = s.replace(/\)\(/g, ')*(');
    s = s.replace(/(\d)\(/g, '$1*(');
    // handle trig: replace sin, cos, tan with Math equivalents (degrees)
    // We'll do a recursive replacement of simple trig with numeric arguments after substituting x.
    // But we can also do direct substitution of x first.
    s = s.replace(/x/g, '(' + xVal + ')');

    // Now handle trig functions in the substituted string
    let maxIter = 30;
    while (/(sin|cos|tan)\s*\(/i.test(s) && maxIter-- > 0) {
      const match = s.match(/(sin|cos|tan)\s*\(([^()]*)\)/i);
      if (!match) break;
      const fullMatch = match[0];
      const func = match[1].toLowerCase();
      const argStr = match[2];
      let argVal;
      try {
        // evaluate argument (should be numeric now, but might contain expressions like 2*30)
        // use evaluateArithmetic but without trig (to avoid recursion issues)
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

    // Final evaluation
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
    const sumx = 0;
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

    // Build step explanation
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
          // arithmetic equation
          const leftVal = evaluateArithmetic(lhs);
          const rightVal = evaluateArithmetic(rhs);
          const equal = Math.abs(leftVal - rightVal) < 1e-9;
          detectionBadge.textContent = 'arithmetic';
          const steps = `Left side: ${lhs} = ${leftVal}\nRight side: ${rhs} = ${rightVal}\n${equal ? '✅ Both sides are equal.' : '❌ Sides are not equal.'}`;
          resultContent.innerHTML = `
            <span class="answer-line">${equal ? 'True' : 'False'}</span>
            <div class="steps">${steps}</div>
          `;
          return;
        }

        // algebraic equation
        if (!/^[0-9x+\-*/().^=sinco ta]+$/.test(input)) { // relaxed check for trig letters
          // more permissive: allow sin cos tan
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

      } else {
        // no equals sign -> arithmetic (may include trig & powers)
        if (/[a-zA-Z]/.test(input) && !/(sin|cos|tan)/i.test(input)) {
          throw new Error('Variables require an equation (e.g., 2x+3=7)');
        }
        const val = evaluateArithmetic(input);
        const rounded = Math.round(val * 1e12) / 1e12;
        detectionBadge.textContent = 'arithmetic';

        // Build explanation steps
        let steps = [];
        // Check if trig present
        if (/(sin|cos|tan)\s*\(/i.test(input)) {
          steps.push(`Trigonometric expression detected. Angles are in degrees.`);
          // Show evaluation of trig parts
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
        // Show power evaluation if present
        if (/\^/.test(input)) {
          steps.push(`Powers are evaluated first (order of operations).`);
        }
        steps.push(`Final result: ${input} = ${rounded}`);
        resultContent.innerHTML = `
          <span class="answer-line">${rounded}</span>
          <div class="steps">${steps.join('\n')}</div>
        `;
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

  // Prefill one example for demo
  window.addEventListener('load', () => {
    // inputEl.value = '2^10';
    // solve();
  });
})();
