/* ============================================================
   Humanizzer IA Steph — moteur de réécriture stylistique
   100 % client (navigateur), aucune API, aucun serveur.
   Applique les règles de style PARTIE 1, 2 + compétence "reformuler".
   NOTE D'HONNÊTETÉ : ce moteur mesure la conformité à des règles
   de style. Il ne fait AUCUNE promesse de résultat face à un
   détecteur IA et n'en vise aucun.
   ============================================================ */
(function (root, factory) {
  const H = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
  else root.Humanizzer = H;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const VERSION = '1.5.0';

  /* Entrée commune : chaîne NFC (accents décomposés des copier-coller PDF/macOS) et bornée */
  const MAX_CHARS = 300000;
  const prep = (t) => {
    const s = String(t == null ? '' : t).normalize('NFC');
    if (s.length > MAX_CHARS) {
      throw new RangeError('Texte trop long (' + s.length + ' caractères) : limite ' + MAX_CHARS + '. Découpez-le en plusieurs parties.');
    }
    return s;
  };

  /* ---------------- petits outils ---------------- */
  const countWords = (t) => (String(t).trim().match(/[\p{L}\p{N}''’_-]+/gu) || []).length;

  // Découpage en phrases tolérant les abréviations académiques courantes
  const ABBR_RE = /\b(?:[Cc]f|pp?|[Ff]ig|env|al|dir|[Vv]ol|[Cc]hap|[Aa]rt|av|apr|M|Mme|Dr|Pr)\.$/;
  const SENT_SEP = '\uE000';
  const splitSentences = (t) => {
    // Sans assertion lookbehind : Safari < 16.4 ne sait pas la parser et ferait échouer tout le fichier.
    const raw = String(t).replace(/\uE000/g, '').replace(/([.!?…])\s+/g, '$1' + SENT_SEP)
      .split(SENT_SEP).map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const part of raw) {
      if (out.length > 0 && ABBR_RE.test(out[out.length - 1])) {
        out[out.length - 1] += ' ' + part;
      } else {
        out.push(part);
      }
    }
    return out;
  };

  const decap1 = (s) => {
    const m = /[A-ZÀ-ÖØ-Þ]/.exec(s);
    return m ? s.slice(0, m.index) + m[0].toLowerCase() + s.slice(m.index + 1) : s;
  };
  const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const matchCase = (src, repl) =>
    src && /[A-ZÀ-ÖØ-Þ]/.test(src[0]) ? cap1(repl) : repl;

  function excerpt(s, n) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ---------------- suivi d'origine des caractères ----------------
     Chaque caractère garde sa trace : « né » de quelle modification (born), « supprimé » par laquelle (dead).
     born/dead = 0 : texte d'origine intact ; -1 : nettoyage d'espaces (toujours appliqué, jamais proposé).
     Une modification (id > 0) = une correspondance d'une règle : elle est donc indépendante des autres. */
  const expandRepl = (rep, a) => String(rep).replace(/\$(\$|&|\d)/g, (x, k) => (k === '$' ? '$' : k === '&' ? a[0] : (typeof a[+k] === 'string' ? a[+k] : '')));

  class Doc {
    constructor(text) {
      this.ch = String(text).split('');
      this.born = new Int32Array(this.ch.length);
      this.dead = new Int32Array(this.ch.length);
      this.edits = [null];
      this._refresh();
    }
    _refresh() {
      const idx = [];
      const out = [];
      for (let i = 0; i < this.ch.length; i++) if (this.dead[i] === 0) { idx.push(i); out.push(this.ch[i]); }
      this.idx = idx;
      this.s = out.join('');
    }
    toString() { return this.s; }
    // Même contrat que String.prototype.replace (callback ou chaîne) ; meta = règle (label…) | null (nettoyage) | 'inherit'
    replace(re, rep, meta) {
      const fn = typeof rep === 'function' ? rep : (...a) => expandRepl(rep, a);
      const found = [];
      this.s.replace(re, function () {
        const a = Array.prototype.slice.call(arguments);
        const out = fn.apply(null, a);
        if (out !== a[0]) found.push([a[a.length - 2], a[0].length, out]);
        return a[0];
      });
      if (!found.length) return this;
      const ins = new Map();
      for (const [off, len, out] of found) {
        let id;
        if (meta === null) id = -1;
        else if (meta === 'inherit') {
          const b = len ? this.born[this.idx[off]] : 0;
          id = b > 0 ? b : (this.edits.push({ label: 'Modification de style' }) - 1);
        } else id = this.edits.push(meta || { label: 'Modification de style' }) - 1;
        let at;
        if (len) {
          for (let j = 0; j < len; j++) this.dead[this.idx[off + j]] = id;
          at = this.idx[off + len - 1] + 1;
        } else at = off < this.idx.length ? this.idx[off] : this.ch.length;
        if (out) { const l = ins.get(at) || []; l.push([id, out]); ins.set(at, l); }
      }
      const n = this.ch.length;
      let extra = 0;
      for (const l of ins.values()) for (const [, t] of l) extra += t.length;
      const ch = new Array(n + extra), born = new Int32Array(n + extra), dead = new Int32Array(n + extra);
      let k = 0;
      for (let i = 0; i <= n; i++) {
        const l = ins.get(i);
        if (l) for (const [id, t] of l) for (let c = 0; c < t.length; c++) { ch[k] = t[c]; born[k] = id; dead[k] = 0; k++; }
        if (i < n) { ch[k] = this.ch[i]; born[k] = this.born[i]; dead[k] = this.dead[i]; k++; }
      }
      this.ch = ch; this.born = born; this.dead = dead;
      this._refresh();
      return this;
    }
    // Modification voisine (texte supprimé juste avant, sinon juste après) à laquelle rattacher la suppression d'un blanc :
    // refuser cette modification rend alors aussi son espace, et le texte d'origine est restitué à l'identique.
    _owner(r) {
      for (let k = r - 1; k >= 0 && this.dead[k] !== 0; k--) if (this.dead[k] > 0) return this.dead[k];
      for (let k = r + 1; k < this.ch.length && this.dead[k] !== 0; k++) if (this.dead[k] > 0) return this.dead[k];
      return -1;
    }
    // Supprime les caractères en trop de chaque correspondance (keep(m) = nombre conservé au début ; < 0 : cas laissé au remplacement classique)
    _prune(re, keep) {
      const found = [];
      this.s.replace(re, function () { const a = Array.prototype.slice.call(arguments); found.push([a[a.length - 2], a[0]]); return a[0]; });
      let touched = false;
      for (const [off, m] of found) {
        const k = keep(m);
        if (k < 0) continue;
        for (let j = k; j < m.length; j++) { const r = this.idx[off + j]; this.dead[r] = this._owner(r); touched = true; }
      }
      if (touched) this._refresh();
      return this;
    }
    trim() {
      let i = 0;
      while (i < this.idx.length && /\s/.test(this.ch[this.idx[i]])) { const r = this.idx[i++]; this.dead[r] = this._owner(r); }
      let j = this.idx.length - 1;
      while (j >= i && /\s/.test(this.ch[this.idx[j]])) { const r = this.idx[j--]; this.dead[r] = this._owner(r); }
      this._refresh();
      return this;
    }
    // Découpe le document en texte inchangé et en modifications (une puce par modification, dans l'ordre du texte)
    segments() {
      const segs = [];
      let same = '';
      let last = null;
      const flush = () => { if (same) { segs.push({ same: true, text: same }); same = ''; } };
      for (let i = 0; i < this.ch.length; i++) {
        const b = this.born[i], d = this.dead[i], c = this.ch[i];
        if (d === -1) continue;
        if ((b === 0 || b === -1) && d === 0) { same += c; last = null; continue; }
        if (b > 0 && d > 0) continue;
        const id = b > 0 ? b : d;
        if (!last || last.id !== id) {
          flush();
          last = { same: false, id, orig: '', repl: '', label: (this.edits[id] && this.edits[id].label) || 'Modification de style' };
          segs.push(last);
        }
        if (b === 0) last.orig += c; else last.repl += c;
      }
      flush();
      return segs;
    }
  }

  // Remplace toutes les occurrences en journalisant chaque modification
  function repAll(cur, re, fn, entry, log) {
    return cur.replace(re, function () {
      const args = Array.prototype.slice.call(arguments);
      const m = args[0];
      const groups = args.slice(1, args.length - 2);
      const offset = args[args.length - 2];
      const whole = args[args.length - 1];
      const after = fn(m, groups, offset, whole);
      if (after !== m) {
        log.push({ id: entry.id, rule: entry.rule, label: entry.label, before: excerpt(m, 90), after: excerpt(after, 90) });
      }
      return after;
    }, entry);
  }

  /* ---------------- 1.3 mots interdits ---------------- */
  const BANNED_WORDS = [
    [/\bcrucial(e|es|s)?\b/gi, { '': 'décisif', e: 'décisive', es: 'décisives', s: 'décisifs' }],
    [/\bessentiel(le|les|e|es|s)?\b/gi, { '': 'nécessaire', le: 'nécessaire', les: 'nécessaires', e: 'nécessaire', es: 'nécessaires', s: 'nécessaires' }],
    [/\bfondamental(e|es|s)?\b/gi, { '': 'central', e: 'centrale', es: 'centrales', s: 'centraux' }],
    [/\bprimordial(e|es|s)?\b/gi, { '': 'majeur', e: 'majeure', es: 'majeures', s: 'majeurs' }],
    [/\bindéniable(e|s|es)?\b/gi, { '': 'évident', e: 'évidente', es: 'évidentes', s: 'évidents' }],
    [/\bincontournable(s)?\b/gi, { '': 'inévitable', s: 'inévitables' }],
    [/\bremarquable(s)?\b/gi, { '': 'notable', s: 'notables' }],
    [/\bexceptionnel(le|les|s)?\b/gi, { '': 'rare', le: 'rare', les: 'rares', s: 'rares' }],
    [/\bfascinant(e|es|s)?\b/gi, { '': 'surprenant', e: 'surprenante', es: 'surprenantes', s: 'surprenants' }],
    [/\bcaptivant(e|es|s)?\b/gi, { '': 'vivant', e: 'vivante', es: 'vivantes', s: 'vivants' }],
    [/\brobuste(s)?\b/gi, { '': 'solide', s: 'solides' }],
    [/\bholistique(s)?\b/gi, { '': "d'ensemble", s: "d'ensemble" }],
    [/\boptimal(e|es|s)?\b/gi, { '': 'idéal', e: 'idéale', es: 'idéales', s: 'idéaux' }],
    [/\bcruciaux\b/gi, { '': 'décisifs' }],
    [/\bfondamentaux\b/gi, { '': 'centraux' }],
    [/\bprimordiaux\b/gi, { '': 'majeurs' }],
    [/\boptimaux\b/gi, { '': 'idéaux' }],
    [/\bparadigme(s)?\b/gi, { '': 'modèle', s: 'modèles' }],
    [/\babsolument\b(?!\s+(?:pas|rien|aucun|aucune|jamais|personne|plus)\b)/gi, { '': 'tout à fait' }],
    [/\bvéritablement\b/gi, { '': 'en fait' }],
    [/\bindubitablement\b/gi, { '': 'sans doute' }],
    [/\bsoulign(e|es|ent|ons|ez)\b/gi, { e: 'montre', es: 'montres', ent: 'montrent', ons: 'montrons', ez: 'montrez' }],
    [/\bincarn(e|es|ent|ons|ez)\b/gi, { e: 'représente', es: 'représentes', ent: 'représentent', ons: 'représentons', ez: 'représentez' }],
    [/\bmet(tent|s)?\s+en\s+lumière\b/gi, { '': 'montre', s: 'montre', tent: 'montrent' }],
    [/\bmet(tent|s)?\s+en\s+avant\b/gi, { '': 'présente', s: 'présente', tent: 'présentent' }],
    [/\bau\s+c[œoe]ur\s+de\b/gi, { '': 'au centre de' }],
    [/\ben\s+constante\s+évolution\b/gi, { '': 'en pleine mutation' }],
    [/\bfavoris(e|es|ent|ons|ez)\b/gi, { e: 'encourage', es: 'encourages', ent: 'encouragent', ons: 'encourageons', ez: 'encouragez' }],
    [/\bvaloris(e|es|ent|ons|ez)\b/gi, { e: 'met en valeur', es: 'mets en valeur', ent: 'mettent en valeur', ons: 'mettons en valeur', ez: 'mettez en valeur' }],
  ];

  const VOWEL_START = /^[aeiouyàâäéèêëîïôöùûüœæh]/i;
  const elisionBroken = (whole, off, repl) =>
    /(?:^|[^\p{L}])(?:qu|[ldjmtsnc])['’]$/iu.test(whole.slice(Math.max(0, off - 4), off)) && !VOWEL_START.test(repl);

  function applyBanned(cur, log) {
    const entry = { id: 'banned', rule: '1.3', label: 'Mot interdit remplacé (1.3)' };
    for (const [re, forms] of BANNED_WORDS) {
      cur = repAll(cur, re, (m, g, off, whole) => {
        const key = (g[0] || '').toLowerCase();
        const base = forms[key] || forms[''];
        const out = matchCase(m, base);
        // « l'essentiel » (nom) ne doit jamais devenir « l'nécessaire » : on laisse tel quel
        return elisionBroken(whole, off, out) ? m : out;
      }, entry, log);
    }
    return cur;
  }

  /* ---------------- 1.2 transitions ---------------- */
  const TRANSITIONS_COUNT_RE = /(?:\bDe plus,|\bEn outre,|\bPar ailleurs,|Il convient de noter que|Il est important de souligner que|Il est à noter que|Force est de constater que|Cela étant dit,|En résumé,|Dans l['’]ensemble,)/gi;

  function applyTransitions(cur, log) {
    const entry = { id: 'transitions', rule: '1.2', label: 'Transition bannie (1.2)' };
    cur = repAll(cur, /\b(?:De plus|En outre|Par ailleurs),\s*/gi, (m) => matchCase(m, 'et '), entry, log);
    cur = repAll(cur, /\bCela étant dit,\s*/gi, (m) => matchCase(m, 'mais '), entry, log);
    cur = repAll(cur, /\bEn résumé,\s*/gi, (m) => matchCase(m, 'donc, '), entry, log);

    // Formules creuses supprimées + gestion intelligente de la majuscule en début de phrase
    const DEL_RE = /(^|([.!?…]\s+)|[,;:]\s+)(Il convient de noter que\s+|Il est important de souligner que\s+|Il est à noter que\s+|Force est de constater que\s+|Dans l['’]ensemble,\s+)([\p{L}])/gimu;
    cur = cur.replace(DEL_RE, (m, prefix, afterDot, phrase, nextChar, offset) => {
      const isStartOfSentence = offset === 0 || Boolean(afterDot) || /^\s*$/.test(prefix);
      const replacementChar = isStartOfSentence ? nextChar.toUpperCase() : nextChar.toLowerCase();
      log.push({
        id: 'transitions',
        rule: '1.2',
        label: 'Formule creuse supprimée (1.2)',
        before: excerpt(phrase, 90),
        after: '(supprimé, la phrase continue : « ' + replacementChar + '… »)',
      });
      return prefix + replacementChar;
    }, { id: 'transitions', rule: '1.2', label: 'Formule creuse supprimée (1.2)' });
    return cur;
  }

  /* ---------------- 1.5 formules de chatbot ---------------- */
  const CHATBOT_RE = /(?:J['’]espère que cela (?:vous )?aide[^.!?\n]*[.!?]?|N['’]hésitez pas à (?:me )?dire[^.!?\n]*[.!?]?|(?:Bien sûr|Absolument)\s*[!?]|Voici un aperçu[^.!?\n:]*:\s*)/gi;
  function applyChatbot(cur, log) {
    const entry = { id: 'chatbot', rule: '1.5', label: 'Formule de chatbot supprimée (1.5)' };
    cur = cur.replace(CHATBOT_RE, (m) => {
      log.push({ id: entry.id, rule: entry.rule, label: entry.label, before: excerpt(m, 90), after: '(supprimé)' });
      return /:\s*$/.test(m) ? '\uE001' : ''; // marqueur : la phrase continue après les deux-points
    }, entry);
    return cur.replace(/\uE001(\p{L})/gu, (_, c) => c.toUpperCase(), 'inherit').replace(/\uE001/g, '', 'inherit');
  }

  /* ---------------- 2.6 tiret cadratin ---------------- */
  // Demi-cadratin « – » espacé entre deux jetons non numériques = incise (hors plages « 10–20 » et « Michaelis–Menten »)
  const SPACED_EN_RE = /(\S)([^\S\n]+)–([^\S\n]+)(\S)/g;
  const spacedEnCount = (t) => {
    let n = 0;
    t.replace(SPACED_EN_RE, (m, a, s1, s2, b) => { if (!(/\d/.test(a) && /\d/.test(b))) n++; return m; });
    return n;
  };
  function applyEmDash(cur, log) {
    const entry = { id: 'emdash', rule: '2.6', label: 'Tiret cadratin remplacé (2.6)' };
    cur = cur.replace(SPACED_EN_RE, (m, a, s1, s2, b) => ((/\d/.test(a) && /\d/.test(b)) ? m : a + s1 + '—' + s2 + b), 'inherit');
    cur = repAll(cur, /[^\S\n]*—[^\S\n]*([^—\n]{2,}?)[^\S\n]*—[^\S\n]*/g, (m, g) => ' (' + g[0].trim() + ') ', entry, log);
    cur = repAll(cur, /[^\S\n]*—[^\S\n]*/g, () => ', ', entry, log);
    return cur;
  }

  /* ---------------- 2.7 flèches ---------------- */
  const ARROW_FIX_RE = /^[^\S\n]*(?:->|=>|→)|[^\S\n]+(?:->|=>)[^\S\n]+/gm;
  function applyArrows(cur, log) {
    const entry = { id: 'arrow', rule: '2.7', label: 'Flèche remplacée (2.7)' };
    cur = repAll(cur, /^[^\S\n]*(?:->|=>|→)[^\S\n]*/gm, () => '', entry, log);
    cur = repAll(cur, /[^\S\n]+(?:->|=>)[^\S\n]+/g, () => ' : ', entry, log);
    return cur; // « → » inline (réaction, flux) et « <-> » restent intacts
  }

  /* ---------------- 2.3 participes parasites ---------------- */
  const PARTICIPES_DETECT_RE = /,\s*(?:soulignant|reflétant|contribuant|favorisant|témoignant|illustrant)\b/gi;
  const PARTICIPES_REPLACE_RE = /,\s*(?:soulignant|reflétant|contribuant|favorisant|témoignant|illustrant)\b[^,.!?\n]*(?:,(?=\s)|(?=[.!?\n]|$))/gi;

  function applyParticipes(cur, log) {
    const entry = { id: 'participes', rule: '2.3', label: 'Participe parasite supprimé (2.3)' };
    return repAll(cur, PARTICIPES_REPLACE_RE, (m) => (/\d/.test(m) ? m : ''), entry, log);
  }

  /* ---------------- 1.4 périphrases ---------------- */
  const PERIPHRASES_DETECT_RE = /(?:\bs['’]imposent? comme\b|\b(?:font|fait) figure de\b|\bconstitue(?:nt)?\s+(?:un|une|le|la|les|des)\b|\b(?:servent|sert)\s+de\s+(?:un|une|le|la|les|des)\b)/gi;
  const PERIPHRASES_RULES = [
    [/\bs['’]imposent comme\b/gi, (m) => matchCase(m, 'sont')],
    [/\bs['’]impose comme\b/gi, (m) => matchCase(m, 'est')],
    [/\bfont figure de\b/gi, (m) => matchCase(m, 'sont')],
    [/\bfait figure de\b/gi, (m) => matchCase(m, 'est')],
    [/\bconstitue(nt)?\s+(un|une|le|la|les|des)\b/gi, (m, g) => matchCase(m, (g[0] && g[0].toLowerCase() === 'nt' ? 'sont' : 'est') + ' ' + g[1])],
    [/\b(servent|sert)\s+de\s+(un|une|le|la|les|des)\b/gi, (m, g) => matchCase(m, (/^servent/i.test(g[0]) ? 'sont' : 'est') + ' ' + g[1])],
  ];

  function applyPeriphrases(cur, log) {
    const entry = { id: 'periphrases', rule: '1.4', label: 'Périphrase simplifiée (1.4)' };
    for (const [re, fn] of PERIPHRASES_RULES) {
      cur = repAll(cur, re, fn, entry, log);
    }
    return cur;
  }

  /* ---------------- 2.10 registre académique ---------------- */
  const REGISTER_DETECT_RE = /\b(?:En ce qui concerne|Afin de|Afin que|Dans le cadre de (?:ce|cet|cette|ces))\b/gi;

  function applyRegister(cur, log) {
    const entry = { id: 'register', rule: '2.10', label: 'Registre simplifié (2.10)' };
    cur = repAll(cur, /\bEn ce qui concerne\s+/gi, (m) => matchCase(m, 'pour '), entry, log);
    cur = repAll(cur, /\bAfin de\s+/gi, (m) => matchCase(m, 'pour '), entry, log);
    cur = repAll(cur, /\bAfin que\s+/gi, (m) => matchCase(m, 'pour que '), entry, log);
    cur = repAll(cur, /\bDans le cadre de (ce|cet|cette|ces)\s+/gi, (m, g) => matchCase(m, 'dans ' + g[0].toLowerCase() + ' '), entry, log);
    return cur;
  }

  /* ---------------- nettoyage final ---------------- */
  function cleanup(cur) {
    cur._prune(/[ \t]{2,}/g, (m) => (/^ +$/.test(m) ? 1 : -1));   // plusieurs espaces -> un seul
    cur.replace(/[ \t]{2,}/g, ' ', null);                          // (restes : séquences contenant une tabulation)
    cur._prune(/ +(?=[,.])/g, () => 0);                           // pas d'espace avant « , » et « . »
    cur._prune(/,{2,}/g, () => 1);                                // virgules doublées
    cur._prune(/\n{3,}/g, () => 2);                               // lignes vides multiples
    return cur.trim();
  }

  /* ---------------- détection / analyse ---------------- */
  const DETECTORS = [
    { id: 'banned', rule: '1.3', label: 'Mots interdits (1.3)', weight: 2, fix: true,
      count: (t) => BANNED_WORDS.reduce((n, [re]) => n + (t.match(re) || []).length, 0) },
    { id: 'transitions', rule: '1.2', label: 'Transitions / formules creuses (1.2)', weight: 2, fix: true,
      count: (t) => (t.match(TRANSITIONS_COUNT_RE) || []).length },
    { id: 'periphrases', rule: '1.4', label: 'Périphrases (1.4)', weight: 2, fix: true,
      count: (t) => (t.match(PERIPHRASES_DETECT_RE) || []).length },
    { id: 'chatbot', rule: '1.5', label: 'Formules de chatbot (1.5)', weight: 4, fix: true,
      count: (t) => (t.match(CHATBOT_RE) || []).length },
    { id: 'participes', rule: '2.3', label: 'Participes parasites (2.3)', weight: 4, fix: true,
      count: (t) => (t.match(PARTICIPES_DETECT_RE) || []).length },
    { id: 'emdash', rule: '2.6', label: 'Tirets cadratins (2.6)', weight: 1, fix: true,
      count: (t) => (t.match(/—/g) || []).length + spacedEnCount(t) },
    { id: 'arrow', rule: '2.7', label: 'Flèches (2.7)', weight: 2, fix: true,
      count: (t) => (t.match(ARROW_FIX_RE) || []).length },
    { id: 'arrowu', rule: '2.7', label: 'Flèche « → » en prose à vérifier (2.7)', weight: 0, fix: false,
      count: (t) => (t.match(/\S[^\S\n]+→[^\S\n]+\S/g) || []).length },
    { id: 'register', rule: '2.10', label: 'Registre académique lourd (2.10)', weight: 1, fix: true,
      count: (t) => (t.match(REGISTER_DETECT_RE) || []).length },
    { id: 'cliche', rule: '1.1', label: 'Introduction cliché (1.1)', weight: 6, fix: false,
      count: (t) => (t.match(/^(?:Plongeons dans|Découvrez comment|À l'[’']ère du|Dans le monde d'aujourd'hui|Dans le monde d’aujourd'hui|Il est indéniable que|Dans cet article, nous allons explorer|Bienvenue dans ce guide)/i) ? 1 : 0) },
    { id: 'vague', rule: '1.6', label: 'Sources vagues (1.6)', weight: 5, fix: false,
      count: (t) => (t.match(/(?:[Ll]es experts s'accordent|[Ll]es experts s’accordent|[Ss]elon plusieurs observateurs|[Ii]l est largement reconnu|[Ii]l est largement admis|[Pp]lusieurs études montrent)/g) || []).length },
    { id: 'triades', rule: '2.4', label: 'Triades systématiques (2.4)', weight: 1, fix: false,
      // mots bornés à 40 caractères : évite le backtracking quadratique sur une longue suite de lettres (ex. séquence ADN)
      count: (t) => (t.match(/[\p{L}'’-]{1,40}(?:\s+[\p{L}'’-]{1,40}){0,3},\s+[\p{L}'’-]{1,40}(?:\s+[\p{L}'’-]{1,40}){0,3}\s+et\s+[\p{L}'’-]{1,40}(?:\s+[\p{L}'’-]{1,40}){0,3}/gu) || []).length },
    { id: 'ps', rule: '2.5', label: '« pas seulement X, aussi Y » (2.5)', weight: 3, fix: false,
      count: (t) => (t.match(/(?:ne\s+)?pas\s+seulement\b[^.!?\n]{0,120}?,\s*(?:mais\s+)?aussi\b/gi) || []).length },
  ];

  function detectSeries(t) {
    // 2.8 : série de phrases très courtes
    const sents = splitSentences(t);
    let run = 0, best = 0;
    for (const s of sents) {
      if (countWords(s) <= 7) { run++; if (run > best) best = run; } else run = 0;
    }
    return best >= 5 ? best : 0;
  }

  function detectLists(t) {
    const lines = t.split('\n').filter((l) => /^\s*(?:[-*•–]|\d+[.)])\s+/.test(l));
    const w = Math.max(1, Math.ceil(countWords(t) / 500));
    return { total: lines.length, excess: Math.max(0, lines.length - 2 * w) };
  }

  function detectBold(t) {
    const n = (t.match(/\*\*[^*\n]+\*\*/g) || []).length + (t.match(/<strong>/g) || []).length;
    const w = Math.max(1, Math.ceil(countWords(t) / 2500));
    return { total: n, excess: Math.max(0, n - 15 * w) };
  }

  function analyze(text) {
    const t = prep(text);
    const sents = splitSentences(t);
    const lens = sents.map(countWords);
    const wc = countWords(t);
    const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    const sd = lens.length > 1 ? Math.sqrt(lens.reduce((a, b) => a + (b - avg) * (b - avg), 0) / lens.length) : 0;
    const violations = [];
    let penalty = 0;
    for (const d of DETECTORS) {
      const n = d.count(t);
      if (n > 0) {
        violations.push({ id: d.id, rule: d.rule, label: d.label, count: n, fixable: d.fix });
        penalty += d.weight * n;
      }
    }
    const series = detectSeries(t);
    if (series) {
      violations.push({ id: 'series', rule: '2.8', label: 'Série de phrases très courtes (2.8)', count: series, fixable: false });
      penalty += 4;
    }
    const lists = detectLists(t);
    if (lists.total) {
      violations.push({ id: 'lists', rule: '2.1', label: 'Listes à puces (2.1)', count: lists.total, fixable: false, excess: lists.excess });
      penalty += lists.excess;
    }
    const bold = detectBold(t);
    if (bold.excess) {
      violations.push({ id: 'bold', rule: '2.9', label: 'Gras excessif (2.9)', count: bold.total, fixable: false });
      penalty += bold.excess;
    }
    const score = Math.max(5, Math.min(100, Math.round(100 - penalty)));
    return {
      words: wc,
      sentences: sents.length,
      avgLen: Math.round(avg * 10) / 10,
      stdev: Math.round(sd * 10) / 10,
      minLen: lens.length ? lens.reduce((a, b) => (b < a ? b : a), lens[0]) : 0,
      maxLen: lens.length ? lens.reduce((a, b) => (b > a ? b : a), lens[0]) : 0,
      score,
      violations,
    };
  }

  /* ---------------- pipeline principal ---------------- */
  function humanizeCore(text, cats) {
    const active = Object.assign(
      { chatbot: true, emdash: true, arrow: true, participes: true, transitions: true, register: true, periphrases: true, banned: true },
      cats || {}
    );
    const log = [];
    const orig = prep(text);
    let cur = new Doc(orig);
    if (active.chatbot) cur = applyChatbot(cur, log);
    if (active.emdash) cur = applyEmDash(cur, log);
    if (active.arrow) cur = applyArrows(cur, log);
    if (active.participes) cur = applyParticipes(cur, log);
    if (active.transitions) cur = applyTransitions(cur, log);
    if (active.register) cur = applyRegister(cur, log);
    if (active.periphrases) cur = applyPeriphrases(cur, log);
    if (active.banned) cur = applyBanned(cur, log);
    cur = cleanup(cur);
    const out = cur.toString();
    return { doc: cur, result: { text: out, log, before: analyze(orig), after: analyze(out) } };
  }
  function humanize(text, cats) { return humanizeCore(text, cats).result; }

  /* ---------------- compétence « reformuler » ---------------- */
  const NUM_RE = /\d+(?:[.,]\d+)?\s*(?:%|€|\$|°C|kg|g|t|km|m|cm|mm|kcal|cal|ms|min|h|ha|L|mL|m²|km²)?/g;

  function mustKeepTokens(text, termes) {
    const set = new Set();
    (String(text).match(NUM_RE) || []).forEach((x) => { const v = x.trim(); if (v) set.add(v); });
    String(termes || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean).forEach((x) => set.add(x));
    return Array.from(set);
  }

  // Ne vérifie sur une phrase donnée que les jetons réellement présents dans cette phrase source
  function tokensInSegment(segment, globalMust) {
    const segLower = String(segment).toLowerCase();
    return globalMust.filter((t) => segLower.includes(t.toLowerCase()));
  }

  // Mots normalisés : NFC, minuscules, apostrophes typographiques ramenées à « ' »
  const normWords = (s) => String(s).normalize('NFC').toLowerCase().replace(/[’‘ʼ`]/g, "'").match(/[\p{L}\p{N}'-]+/gu) || [];
  const ngrams = (w, n) => {
    const set = new Set();
    for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
    return set;
  };
  const bigrams = (s) => ngrams(normWords(s), 2);

  // Début de phrase qui ressemble à un sujet : condition pour dédoubler sans créer de fragment
  const SUBJECT_START = /^(?:le|la|les|l['’]|un|une|des|il|elle|ils|elles|on|nous|ce|cet|cette|ces|cela|ça|son|sa|ses|leur|leurs|notre|nos|je|vous)\b/i;
  // Minuscule initiale seulement pour un mot-outil connu (jamais « ADN » -> « aDN », « Pasteur » -> « pasteur »)
  const FUSION_START = /^(?:Il|Elle|Ils|Elles|On|Ce|Cet|Cette|Ces|Cela|Ceci|Les|Le|La|Un|Une|Des|Nous|Vous|Je|Mais|Donc|Ainsi|Pourtant|Aussi|L['’])\b/;
  const decapSafe = (b) => (FUSION_START.test(b) ? b.charAt(0).toLowerCase() + b.slice(1) : null);
  function jaccard(a, b) {
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const u = a.size + b.size - inter;
    return u ? inter / u : 0;
  }

  /* ---- transformations de structure sûres : chacune a des préconditions strictes ---- */
  // Proposition « complexe » (subordonnée, relative, coordination de propositions) : on s'abstient
  const hasComplexClause = (t) =>
    /\b(?:que|qui|dont|lorsque|quand|si|puisque|parce|comme|tandis)\b|qu['’]|(?:^|\s)où(?:\s|$)|,\s+(?:mais|et|ou|donc|car|or|cependant|toutefois)\b/i.test(t);
  const hasAmbiguousAttach = (t) => /\b(?:permet|permettent|afin|pour)\b|\b(?:de\s+|d['’])\p{L}{3,}(?:er|ir|re)\b/iu.test(t);
  const hasNegation = (t) => /\b(?:ne\b|n['’])/i.test(t);

  const PP_PREP = "(?:après|avant|pendant|durant|depuis|lors (?:de|du|des)|au cours (?:de|du|des)|à la suite (?:de|du|des)|en raison (?:de|du|des)|grâce (?:à|au|aux)|dans le cadre (?:de|du|des))";
  const PP_COMP = "((?:[^\\s,;:()]+\\s+){0,5}[^\\s,;:()]+)";   // complément : 1 à 6 mots, sans ponctuation interne
  const PP_END_RE = new RegExp("^(.+)\\s(" + PP_PREP + ")\\s+" + PP_COMP + "\\.$", 'i');
  const YEAR_END_RE = /^(.+)\s(en (?:19|20)\d{2})\.$/;
  const REPORT_VERBS = "(?:révèle|révèlent|montre|montrent|indique|indiquent|démontre|démontrent|confirme|confirment|suggère|suggèrent|prouve|prouvent|établit|établissent)";
  const QUE_PP_RE = new RegExp("^(.+?\\s" + REPORT_VERBS + ")\\s+que\\s+(.+)\\s(" + PP_PREP + ")\\s+" + PP_COMP + "\\.$", 'i');

  // « Après X, <phrase>. »  ou, dans « L'étude montre que … après X », « L'étude montre qu'après X, … »
  function frontAdverbial(s) {
    let m = QUE_PP_RE.exec(s);
    if (m) {
      const head = m[1], rest = m[2], prep = m[3], comp = m[4];
      if (hasNegation(head) || hasComplexClause(rest) || hasAmbiguousAttach(rest)) return null;
      return head + ' ' + (/^[aeiouyàâäéèêëîïôöùûüh]/i.test(prep) ? "qu'" : 'que ') + prep + ' ' + comp + ', ' + rest + '.';
    }
    let first, pp;
    m = PP_END_RE.exec(s);
    if (m) { first = m[1]; pp = m[2] + ' ' + m[3]; }
    else {
      m = YEAR_END_RE.exec(s);
      if (!m) return null;
      first = m[1]; pp = m[2];
    }
    if (hasComplexClause(first) || hasAmbiguousAttach(first) || countWords(first) < 5) return null;
    const low = decapSafe(first);            // jamais de minuscule sur un nom propre ou un acronyme
    return low ? cap1(pp) + ', ' + low + '.' : null;
  }

  // « L'analyse révèle que Y » -> « Il ressort de l'analyse que Y » / « D'après l'analyse, Y »
  // Sujet limité aux sources d'information (analyse, étude, résultats…), jamais une personne ; pas de négation.
  const SRC_NOUNS = "(?:analyses?|études?|enquêtes?|recherches?|expériences?|expérimentations?|observations?|mesures?|résultats?|données?|essais?|tests?|travaux|examens?|suivis?|bilans?|évaluations?|comparaisons?|dosages?|criblages?)";
  const SRC_RE = new RegExp("^(L['’]|(?:Le|La|Les|Cette|Cet|Ces|Notre|Nos|Son|Sa|Ses)\\s+)(" + SRC_NOUNS + ")\\b([^,;:()]*?)\\s+(?:révèle|révèlent|montre|montrent|indique|indiquent|met(?:tent)? en évidence)\\s+(que\\s+|qu['’])(.+)$");
  const GEN = { Le: 'du', La: 'de la', Les: 'des', Cette: 'de cette', Cet: 'de cet', Ces: 'de ces', Notre: 'de notre', Nos: 'de nos', Son: 'de son', Sa: 'de sa', Ses: 'de ses' };
  function reportedSource(s) {
    const m = SRC_RE.exec(s);
    if (!m) return null;
    const det = m[1], noun = m[2], np = m[3], que = m[4], rest = m[5];
    if (hasNegation(np) || /\b(?:que|qui|dont)\b/i.test(np) || countWords(np) > 8) return null;
    const dlow = det.charAt(0).toLowerCase() + det.slice(1);
    const gen = /^L['’]/.test(det) ? 'de ' + dlow : GEN[det.trim()] + ' ';
    return {
      a: 'Il ressort ' + gen + noun + np + ' ' + que + rest,
      b: "D'après " + dlow + noun + np + ', ' + rest,
    };
  }

  // « Le test permet de Y » -> « Avec le test, on peut Y »
  const PERM_RE = /^(L['’]|(?:Le|La|Les|Cette|Cet|Ces)\s+)(.+?)\s+(?:permet|permettent)\s+(?:de\s+|d['’])(.+)$/;
  function permetDe(s) {
    const m = PERM_RE.exec(s);
    if (!m) return null;
    const np = m[2];
    if (/[,;:()]/.test(np) || hasNegation(np) || /\b(?:que|qui|dont)\b/i.test(np) || countWords(np) > 8) return null;
    return 'Avec ' + m[1].charAt(0).toLowerCase() + m[1].slice(1) + np + ', on peut ' + m[3];
  }

  function variantsFor(s, globalMust) {
    const localMust = tokensInSegment(s, globalMust);
    const out = [];
    const push = (text, type) => {
      text = String(text).replace(/\s{2,}/g, ' ').trim();
      if (!text || text.toLowerCase() === s.toLowerCase()) return;
      const textLower = text.toLowerCase();
      const ok = localMust.every((t) => textLower.includes(t.toLowerCase()));
      const risk = jaccard(bigrams(s), bigrams(text));
      out.push({ text, type, ok, risk: Math.round(risk * 100) / 100, patch: risk > 0.6, fusion: false });
    };
    // 1) dédoublement : une longue phrase devient deux
    const m = s.match(/^(.{25,}?),\s+(et|mais|donc|cependant|toutefois)\s+(.+?)([.!?]?)$/i);
    if (m && SUBJECT_START.test(m[3])) {
      const first = m[1] + '.';
      const second = cap1(m[2] + ' ' + m[3]) + (m[4] || '.');
      push(first + ' ' + second, 'Dédoublement en deux phrases');
    }
    // 2) structure impersonnelle « Il y a X qui Y » -> « X Y »
    if (/^[Ii]l y a\s+(?:un|une|des|plusieurs|quelques|de|du|d['’]|le|la|les|l['’])\b/.test(s) && /\s+qui\s+/.test(s)) {
      let v = s.replace(/^[Ii]l y a\s+/, '');
      v = cap1(v.replace(/\s+qui\s+/, ' '));
      push(v, 'Suppression de la structure « il y a … qui »');
    }
    // 3) tournures impersonnelles courantes
    const IMP = [
      [/Il est possible de\s+/gi, (m) => matchCase(m, 'on peut ')],
      [/Il était possible de\s+/gi, (m) => matchCase(m, 'on pouvait ')],
      [/Il est nécessaire de\s+/gi, (m) => matchCase(m, 'il faut ')],
      [/Il est indispensable de\s+/gi, (m) => matchCase(m, 'il faut ')],
      [/C['’]est la raison pour laquelle/gi, (m) => matchCase(m, "c'est pourquoi")],
    ];
    let v3 = s;
    for (const [re, to] of IMP) v3 = v3.replace(re, to);
    if (v3 !== s) push(v3, 'Tournure impersonnelle reformulée');
    // 4) complément circonstanciel final placé en tête
    const front = frontAdverbial(s);
    if (front) push(front, 'Complément circonstanciel déplacé en tête');
    // 5) sujet « source d'information » + verbe de constat
    const rs = reportedSource(s);
    if (rs) {
      push(rs.a, 'Tournure « Il ressort de … que »');
      push(rs.b, 'Tournure « D’après … , »');
    }
    // 7) voix passive -> active (agent humain ou collectif)
    const pa = passiveToActive(s);
    if (pa) push(pa, 'Voix passive → voix active');
    const ap = activeToPassive(s);
    if (ap) push(ap, 'Voix active → voix passive');
    // 6) « permet de »
    const pm = permetDe(s);
    if (pm) push(pm, 'Sujet remplacé par « Avec … , on peut »');
    return out;
  }

  function reformuler(texte, source, termes) {
    const t = prep(texte);
    const must = mustKeepTokens(t, termes);
    const flat = [];
    t.split(/\n\s*\n/).forEach((p, pi) => splitSentences(p).forEach((s) => flat.push({ s, para: pi })));
    const items = flat.map((x, i) => ({
      i,
      para: x.para,
      original: x.s,
      variants: variantsFor(x.s, must),
      chosen: null,
      canMergeWithPrev: false,
    }));
    // Fusions de phrases courtes consécutives (même paragraphe uniquement)
    for (let i = 0; i + 1 < flat.length; i++) {
      if (flat[i].para !== flat[i + 1].para) continue;
      const a = flat[i].s, b = flat[i + 1].s;
      const low = decapSafe(b);
      if (low && countWords(a) <= 12 && countWords(b) <= 12) {
        const merged = a.replace(/[.!?…]+$/, '') + ', ' + low;
        const pairMust = tokensInSegment(a + ' ' + b, must);
        const mergedLower = merged.toLowerCase();
        const ok = pairMust.every((x) => mergedLower.includes(x.toLowerCase()));
        const risk = jaccard(bigrams(a + ' ' + b), bigrams(merged));
        items[i].variants.push({
          text: merged,
          type: 'Fusion avec la phrase suivante',
          ok,
          risk: Math.round(risk * 100) / 100,
          patch: risk > 0.6,
          fusion: true,
        });
        items[i + 1].canMergeWithPrev = true;
      }
    }
    const warns = [];
    if (!source || !source.trim()) {
      warns.push("Aucune source indiquée (facultatif ici) : si l'idée vient d'un article, d'un livre ou d'un cours, citez-la (auteur, année, page) dans votre texte final.");
    }
    if (/«[^»]{10,}»/.test(t) && !/\([^)]*(?:\d{4}|al\.)[^)]*\)/.test(t)) {
      warns.push('Des guillemets « … » sont présents sans repère de citation (Auteur, année). Une citation mot à mot exige les guillemets ET la référence exacte.');
    }
    return { must, items, warns };
  }

  // Recompose le texte à partir des choix : une fusion consomme la phrase suivante, jamais plus ;
  // les paragraphes sont conservés ; aucune phrase ne peut disparaître.
  function compose(items) {
    const out = [];
    let parts = [];
    let curPara = null;
    const flush = () => { if (parts.length) out.push(parts.join(' ')); parts = []; };
    let i = 0;
    while (i < items.length) {
      const it = items[i], next = items[i + 1], ch = it.chosen;
      if (curPara !== null && it.para !== curPara) flush();
      curPara = it.para;
      if (ch && ch.fusion && next && next.para === it.para) { parts.push(ch.text); i += 2; }
      else { parts.push(ch && !ch.fusion ? ch.text : it.original); i += 1; }
    }
    flush();
    return out.join('\n\n').trim();
  }

  // Contrôle d'une reformulation par rapport à l'extrait original de la source
  function patchCheck(extraitSource, texteReformule) {
    const src = prep(extraitSource), out = prep(texteReformule);
    const wa = normWords(src), wb = normWords(out);
    const wSrc = countWords(src), wOut = countWords(out);
    const ratio = wSrc ? Math.round((wOut / wSrc) * 100) / 100 : 0;
    const r2 = (x) => Math.round(x * 100) / 100;
    if (wa.length < 4 || wb.length < 4) {
      return { distance: 0, similarity: 0, jaccard: 0, containment: 0, ratio, reliable: false,
        verdict: 'Extrait trop court (moins de 4 mots) : la mesure de proximité n’est pas fiable. Comparez à l’œil.' };
    }
    const jac = jaccard(ngrams(wa, 2), ngrams(wb, 2));
    // Reprise : part des 4-grammes de la SOURCE retrouvés tels quels (insensible au texte ajouté autour)
    const g = ngrams(wa, 4), gb = ngrams(wb, 4);
    let hit = 0;
    for (const x of g) if (gb.has(x)) hit++;
    const containment = g.size ? hit / g.size : 0;
    const dist = Math.max(jac, containment);
    let verdict;
    if (dist > 0.6) verdict = 'Risque élevé de patchwriting : même charpente que la source, ou passages repris tels quels. Changez la construction des phrases (ordre des propositions, sujet grammatical, découpage).';
    else if (dist > 0.4) verdict = 'Proximité moyenne : vérifiez la charpente phrase par phrase (même ordre de propositions = paraphrase insuffisante).';
    else verdict = 'Bonne distance d’expression avec la source. Vérifiez maintenant la fidélité du sens (chiffres, unités, nuances).';
    return { distance: r2(dist), similarity: r2(dist), jaccard: r2(jac), containment: r2(containment), ratio, reliable: true, verdict };
  }


  /* =====================================================================
     v1.4 : relecture modification par modification, qualité du texte,
     suggestions de style, voix passive -> active (sujet « agent humain »)
     ===================================================================== */

  /* ---------- relecture modification par modification ---------- */
  const MAX_CHIPS = 3000;

  // Découpe le résultat de humanize() en texte inchangé et en modifications indépendantes (une par correspondance de règle)
  function review(text, cats) {
    const core = humanizeCore(text, cats);
    const segments = core.doc.segments();
    const nb = segments.filter((x) => !x.same).length;
    return Object.assign({}, core.result, { segments: nb > MAX_CHIPS ? null : segments, modifications: nb });
  }

  // Reconstruit le texte selon les choix (accepted[i] === false : on garde l'original de ce segment)
  function assemble(segments, accepted) {
    return segments.map((s, i) => (s.same ? s.text : (accepted && accepted[i] === false ? s.orig : s.repl))).join('').trim();
  }

  /* ---------- qualité du texte : lisibilité, richesse lexicale, répétitions ---------- */
  const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæÿ';
  /* ---------- données Lexique 3.83 (facultatives, chargées à la demande) ----------
     Fichier lexique-data.js : syllabes, genre des noms, conjugaison. Licence CC BY-SA 4.0 (New, Pallier et al.).
     Sans ce fichier, tout fonctionne avec des règles de repli (moins précises). */
  let LEX = null;
  const VOW_NOY = 'aeiouàâäéèêëîïôöùûüœæ';
  const RE_Y = new RegExp('([' + VOW_NOY + '])y([' + VOW_NOY + '])', 'g');
  const RE_MUTE = new RegExp('[^' + VOWELS + ']es?$');
  const RE_GROUP = new RegExp('[' + VOWELS + ']+', 'g');

  // Règles de repli : groupes vocaliques, « y » entre voyelles = consonne, -que/-gue (u muet), « e » muet final
  function syllablesRules(word) {
    let w = String(word).toLowerCase().replace(/['’]/g, '');
    w = w.replace(RE_Y, '$1j$2').replace(/([qg])ue(s?)$/, '$1$2');
    const g = w.match(RE_GROUP);
    if (!g) return 1;
    let n = g.length;
    if (n > 1 && RE_MUTE.test(w)) n--;
    return Math.max(1, n);
  }
  // Nombre de syllabes (convention phonétique de Lexique : « table » = 1) : exceptions du dictionnaire, sinon règles
  function syllables(word) {
    const w = String(word).toLowerCase().replace(/’/g, "'");
    if (LEX && LEX.syl.has(w)) return LEX.syl.get(w);
    return syllablesRules(w);
  }

  function setLexique(data) {
    if (!data) { LEX = null; return false; }
    const syl = new Map();
    for (const k of Object.keys(data.syl || {})) for (const w of data.syl[k].split(' ')) if (w) syl.set(w, +k);
    const genre = new Map();
    for (const g of ['m', 'f']) for (const w of ((data.genre || {})[g] || '').split(' ')) if (w) genre.set(w, g);
    const lem = new Map(), finite = new Map(), part = new Map();
    const register = (lemma, f) => {
      lem.set(lemma, f);
      for (const [k, tense, plural] of [['p3s', 'pres', false], ['p3p', 'pres', true], ['i3s', 'imp', false], ['i3p', 'imp', true], ['f3s', 'fut', false], ['f3p', 'fut', true]]) {
        if (!f[k]) continue;
        const l = finite.get(f[k]) || [];
        l.push({ lemma, tense, plural });
        finite.set(f[k], l);
      }
      for (const [k, g, n] of [['ms', 'm', 's'], ['fs', 'f', 's'], ['mp', 'm', 'p'], ['fp', 'f', 'p']]) {
        const form = f.par[k];
        if (!form) continue;
        const e = part.get(form);
        if (e && e.lemma !== lemma) e.amb = true; else if (!e) part.set(form, { lemma, g, n, amb: false });
      }
    };
    const v = data.verbs || {};
    for (const lemma of (v.reg || '').split(' ')) {
      if (!lemma) continue;
      const stem = lemma.slice(0, -2);
      register(lemma, {
        p3s: conj1(stem, 'pres', false), p3p: conj1(stem, 'pres', true), i3s: conj1(stem, 'imp', false), i3p: conj1(stem, 'imp', true),
        f3s: conj1(stem, 'fut', false), f3p: conj1(stem, 'fut', true), par: { ms: stem + 'é', fs: stem + 'ée', mp: stem + 'és', fp: stem + 'ées' },
      });
    }
    for (const lemma of Object.keys(v.irr || {})) {
      const [fin, pa] = v.irr[lemma].split(';');
      const a = fin.split(','), b = pa.split(',');
      register(lemma, { p3s: a[0], p3p: a[1], i3s: a[2], i3p: a[3], f3s: a[4], f3p: a[5], par: { ms: b[0], fs: b[1], mp: b[2], fp: b[3] } });
    }
    LEX = { syl, genre, lem, finite, part, version: data.version || '' };
    return true;
  }
  const lexiqueChargee = () => LEX !== null;

  const STOP = new Set(('le la les l un une des du de d et ou mais donc or ni car que qui quoi dont où ce cet cette ces ça cela ceci celui celle ceux celles ' +
    'il elle on ils elles nous vous je tu me te se lui leur leurs eux en y à au aux par pour sur sous dans avec sans entre vers chez comme si ne pas plus moins ' +
    'très aussi alors ainsi puis cependant toutefois pourtant lors ensuite est sont était étaient être été sera seront a ont avait avaient avoir aura auront ' +
    'fait faire peut peuvent pouvoir doit doivent devoir son sa ses mon ma mes ton ta tes notre nos votre vos tout tous toute toutes autre autres même mêmes ' +
    'chaque plusieurs certains certaines quelques déjà encore ici là quand lorsque puisque parce afin selon après avant pendant depuis jusqu qu n s t m c j ' +
    'sont fut furent soit sera étant ayant donné nombre cas part type').split(' '));

  // Pistes de synonymes : SUGGESTIONS À VALIDER selon le contexte (jamais appliquées automatiquement)
  const SYN = [
    [/^études?$/, 'étude', 'recherche, travail, enquête'],
    [/^résultats?$/, 'résultat', 'observation, donnée, constat'],
    [/^montr/, 'montrer', 'révéler, indiquer, mettre en évidence, établir'],
    [/^utilis/, 'utiliser', 'employer, recourir à, mobiliser'],
    [/^méthodes?$/, 'méthode', 'procédé, technique, protocole, approche'],
    [/^augment/, 'augmenter', 's’accroître, croître, progresser'],
    [/^important/, 'important', 'notable, majeur, déterminant'],
    [/^différent/, 'différent', 'distinct, divers'],
    [/^permet/, 'permettre', 'rendre possible, autoriser, donner accès à'],
  ];

  // MATTR (Covington & McFall, 2010) : moyenne du TTR sur une fenêtre glissante, insensible à la longueur du texte
  function mattr(toks, w) {
    const n = toks.length;
    if (n < w) return null;
    const counts = new Map();
    let distinct = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const a = toks[i];
      const ca = counts.get(a) || 0;
      if (ca === 0) distinct++;
      counts.set(a, ca + 1);
      if (i >= w) {
        const b = toks[i - w];
        const cb = counts.get(b) - 1;
        counts.set(b, cb);
        if (cb === 0) distinct--;
      }
      if (i >= w - 1) sum += distinct / w;
    }
    return sum / (n - w + 1);
  }

  function quality(text) {
    const t = prep(text);
    const sents = splitSentences(t);
    const toks = t.toLowerCase().match(/\p{L}+(?:-\p{L}+)*|\p{N}+/gu) || [];
    const words = toks.filter((w) => /\p{L}/u.test(w));
    const nW = words.length, nS = sents.length;
    // Mots tels qu'on les compte à l'écrit (« l'étude » = 1 mot) pour la lisibilité
    const readW = t.toLowerCase().match(/\p{L}+(?:['’-]\p{L}+)*/gu) || [];
    const nR = readW.length;
    const syl = readW.reduce((a, w) => a + syllables(w), 0);

    // Flesch adapté au français (Kandel & Moles, 1958)
    const asl = nS ? nR / nS : 0, asw = nR ? syl / nR : 0;
    const fre = 207 - 1.015 * asl - 73.6 * asw;
    const rLabel = fre >= 60 ? 'plutôt facile' : fre >= 40 ? 'intermédiaire' : fre >= 20 ? 'difficile' : 'très difficile';

    // richesse lexicale
    const win = 50;
    const m = mattr(words, win);
    const ttr = nW ? new Set(words).size / nW : 0;

    // mots lexicaux les plus répétés
    const freq = new Map();
    for (const w of words) {
      if (w.length < 4 || STOP.has(w) || /^\p{N}+$/u.test(w)) continue;
      const k = w.length > 4 ? w.replace(/[sx]$/, '') : w;
      const e = freq.get(k) || { count: 0, forms: new Map() };
      e.count++;
      e.forms.set(w, (e.forms.get(w) || 0) + 1);
      freq.set(k, e);
    }
    const repeated = [...freq.values()].filter((e) => e.count >= 3)
      .sort((a, b) => b.count - a.count).slice(0, 5)
      .map((e) => {
        const word = [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const syn = SYN.find(([re]) => re.test(word));
        return { word, count: e.count, hint: syn ? { lemma: syn[1], alternatives: syn[2] } : null };
      });

    // phrases très longues
    const longSentences = sents.map((s) => ({ words: countWords(s), excerpt: excerpt(s, 110) })).filter((x) => x.words >= 40);

    return {
      words: nR, sentences: nS,
      readability: {
        score: Math.round(fre * 10) / 10, label: rLabel, asl: Math.round(asl * 10) / 10, asw: Math.round(asw * 100) / 100, reliable: nR >= 100 && nS >= 3,
        method: LEX ? 'dictionnaire Lexique 3.83 (mots courants exacts) + règles pour les autres mots'
          : 'règles seules (exactes pour environ 99 % des occurrences du français courant et 91 % des mots rares, mesuré sur Lexique 3.83)',
        dictionary: LEX !== null,
      },
      lexical: { mattr: m === null ? null : Math.round(m * 1000) / 1000, window: win, ttr: Math.round(ttr * 1000) / 1000, reliable: m !== null && nW >= 2 * win },
      repeated, longSentences,
    };
  }

  /* ---------- suggestions de style : JAMAIS corrigées automatiquement ---------- */
  const INITIER_OBJ = '(?:projets?|programmes?|politiques?|démarches?|débats?|discussions?|réflexions?|partenariats?|collaborations?|stratégies?|réformes?|plans?|actions?|initiatives?|dialogues?|études?|recherches?|enquêtes?)';
  const STYLE_HINTS = [
    { kind: 'Pléonasme', re: /\bau jour d['’]aujourd['’]hui\b/gi, advice: '« aujourd’hui », « à ce jour » ou « actuellement »' },
    { kind: 'Pléonasme', re: /\bmont(?:er|e|ent|ons|ez|é|ée|és|ées|ait|aient)\s+en haut\b/gi, advice: 'le verbe seul : « monter »' },
    { kind: 'Pléonasme', re: /\bdescend(?:re|s|ent|ons|ez|u|ue|us|ues|ait|aient)\s+en bas\b/gi, advice: 'le verbe seul : « descendre »' },
    { kind: 'Pléonasme', re: /\bsort(?:ir|ent|s|t|ons|ez|i|ie|is|ies|ait|aient)\s+dehors\b/gi, advice: 'le verbe seul : « sortir »' },
    { kind: 'Pléonasme', re: /\bentr(?:er|e|ent|ons|ez|é|ée|és|ées|ait|aient)\s+dedans\b/gi, advice: 'le verbe seul : « entrer »' },
    { kind: 'Pléonasme', re: /\b(?:collabor|coop[ée]r|cohabit|r[ée]uni|concert)\p{L}*\s+ensemble\b/giu, advice: '« travailler ensemble » ou le verbe seul (« collaborer »)',
      nuance: 'Parfois justifié par un souci de clarté (OQLF) : à vous de juger selon le contexte.' },
    { kind: 'Pléonasme', re: /\bavér\p{L}*\s+(?:vrai|exact)\p{L}*/giu, advice: '« se révéler exact », « être confirmé », ou « s’avérer » suivi d’un autre adjectif',
      nuance: 'Traditionnellement jugé pléonastique, mais pas toujours fautif (OQLF) ; dans la langue soignée, mieux vaut l’éviter.' },
    { kind: 'Pléonasme', re: /\bcomme par exemple\b/gi, advice: '« par exemple » ou « comme »' },
    { kind: 'Pléonasme', re: /\bvoire même\b/gi, advice: '« voire » ou « même » seul' },
    { kind: 'Pléonasme', re: /\bs['’]entraid\p{L}*\s+mutuellement\b/giu, advice: '« s’entraider » seul' },
    { kind: 'Pléonasme', re: /\b(?:prévo|prévoi|prédi)\p{L}*\s+(?:à l['’]avance|d['’]avance)\b/giu, advice: 'le verbe seul (« prévoir », « prédire »)' },
    { kind: 'Pléonasme', re: /\bunanimité totale\b/gi, advice: '« unanimité »' },
    { kind: 'Anglicisme', re: new RegExp("\\binitie\\p{L}*\\s+(?:un|une|le|la|les|des|ce|cette|ces|son|sa|ses|notre|nos)\\s+(?:nouveau\\s+|nouvelle\\s+|nouveaux\\s+)?" + INITIER_OBJ + "\\b", 'giu'),
      advice: '« lancer », « engager », « amorcer », « entreprendre » ou « être à l’origine de »',
      nuance: 'Au sens de « commencer ». En sciences, « initier une réaction / la transcription » reste correct (Académie française, 9e éd.).' },
    { kind: 'Anglicisme', re: /\bmet(?:tre|s|tent|tons|tez)?\s+l['’]emphase\b/gi, advice: '« mettre l’accent sur »' },
  ];

  function suggest(text) {
    const t = prep(text);
    const out = [];
    for (const h of STYLE_HINTS) {
      for (const m of t.matchAll(h.re)) {
        out.push({ kind: h.kind, found: m[0], advice: h.advice, nuance: h.nuance || '', index: m.index });
      }
    }
    return out.sort((a, b) => a.index - b.index);
  }

  /* ---------- voix passive <-> active (agent humain ou collectif uniquement) ---------- */
  // « par » introduit aussi un MOYEN (« obtenu par filtration ») : on ne convertit que si l'agent est une personne ou une équipe.
  const AGENT_HEADS = "(?:chercheurs?|chercheuses?|auteurs?|équipes?|scientifiques?|laboratoires?|participants?|patients?|médecins?|cliniciens?|experts?|techniciens?|étudiants?|enseignants?|enquêteurs?|expérimentateurs?|investigateurs?|biologistes?|chimistes?|analystes?|opérateurs?|infirmiers?)";
  const AGENT_DET = "(l['’]|(?:le|la|les|un|une|des|ces|cette|notre|nos|ses|leurs?)\\s+)";
  const TAIL_PP = "(?:(?:[^\\s,;:()]+\\s+){0,5}[^\\s,;:()]+)";
  const WORD = "[a-zàâäçéèêëîïôöùûüœ]+";
  const PASSIVE_RE = new RegExp(
    "^((?:Le|La|L['’]|Les|Cette|Ces|Un|Une|Des|Notre|Nos|Son|Sa|Ses)(?:\\s?[^\\s,;:()]+){0,8}?)\\s+(est|sont|était|étaient|sera|seront|a été|ont été)\\s+" +
    "(" + WORD + ")\\s+par\\s+" + AGENT_DET + "(" + AGENT_HEADS + ")((?:\\s+" + PP_PREP + "\\s+" + TAIL_PP + ")?)\\.$");
  const ACTIVE_RE = new RegExp(
    "^(L['’]|(?:Le|La|Les|Un|Une|Des|Ces|Cette|Notre|Nos)\\s+)(" + AGENT_HEADS + ")\\s+((?:a|ont)\\s+" + WORD + "|" + WORD + ")\\s+" +
    "(l['’]|(?:le|la|les|un|une|des|ce|cet|cette|ces|son|sa|ses|notre|nos)\\s+)(" + WORD + ")((?:\\s+" + PP_PREP + "\\s+" + TAIL_PP + ")?)\\.$");
  const NOCONS = '[^' + VOWELS + ']';
  // verbes qui n'ont pas de passif avec un complément d'objet direct (copules, auxiliaires, modaux)
  const NO_PASSIVE = new Set(['être', 'avoir', 'devoir', 'pouvoir', 'savoir', 'vouloir', 'falloir', 'sembler', 'paraître', 'rester', 'demeurer', 'devenir', 'aller', 'venir']);

  function conj1(stem, tense, plural) {
    let st = stem;
    if (tense === 'pres') {
      if (/y$/.test(st)) st = st.slice(0, -1) + 'i';
      st = st.replace(new RegExp('é(' + NOCONS + '+)$'), 'è$1').replace(new RegExp('e(' + NOCONS + ')$'), 'è$1');
      return st + (plural ? 'ent' : 'e');
    }
    if (tense === 'imp') {
      if (/g$/.test(st)) st += 'e';
      else if (/c$/.test(st)) st = st.slice(0, -1) + 'ç';
      return st + (plural ? 'aient' : 'ait');
    }
    if (/y$/.test(st)) st = st.slice(0, -1) + 'i';
    st = st.replace(new RegExp('e(' + NOCONS + ')$'), 'è$1');
    return st + (plural ? 'eront' : 'era');
  }

  // Forme active conjuguée pour un participe : dictionnaire (irréguliers compris) ou règle des verbes en -er
  function activeForm(word, tense, plural) {
    const info = LEX && LEX.part.get(word);
    if (info) {
      if (info.amb || NO_PASSIVE.has(info.lemma)) return null;
      const f = LEX.lem.get(info.lemma);
      if (!f) return null;
      const out = tense === 'pc' ? (f.par.ms ? (plural ? 'ont ' : 'a ') + f.par.ms : '')
        : f[({ pres: 'p3', imp: 'i3', fut: 'f3' })[tense] + (plural ? 'p' : 's')];
      return out || null;
    }
    // verbe inconnu du dictionnaire : seulement les participes réguliers en -é, et on s'abstient pour les cas à doublement
    if (!/(?:é|ée|és|ées)$/.test(word)) return null;
    const stem = word.replace(/(?:é|ée|és|ées)$/, '');
    if (stem.length < 3 || /(?:el|et)$/.test(stem) || /^(?:envoy|all|ét)/.test(stem)) return null;
    return tense === 'pc' ? (plural ? 'ont ' : 'a ') + stem + 'é' : conj1(stem, tense, plural);
  }

  function passiveToActive(s) {
    const m = PASSIVE_RE.exec(s);
    if (!m) return null;
    const subj = m[1], aux = m[2], word = m[3], det = m[4], head = m[5], tail = m[6] || '';
    if (hasNegation(subj) || hasComplexClause(subj) || countWords(subj) > 9) return null;
    const plural = /^(?:les|des|ces|nos|ses|leurs)$/.test(det.trim().toLowerCase());
    const tense = /^(?:est|sont)$/.test(aux) ? 'pres' : /^(?:était|étaient)$/.test(aux) ? 'imp' : /^(?:sera|seront)$/.test(aux) ? 'fut' : 'pc';
    const verb = activeForm(word, tense, plural);
    if (!verb) return null;
    const obj = subj.charAt(0).toLowerCase() + subj.slice(1);
    return cap1(det + head) + ' ' + verb + ' ' + obj + tail + '.';
  }

  // « Les chercheurs mesurent la concentration. » -> « La concentration est mesurée par les chercheurs. »
  // Exige le dictionnaire : le participe s'accorde avec le GENRE du complément d'objet, que seule la base connaît.
  function activeToPassive(s) {
    if (!LEX) return null;
    const m = ACTIVE_RE.exec(s);
    if (!m) return null;
    const agDet = m[1], agHead = m[2], vb = m[3], obDet = m[4], noun = m[5], tail = m[6] || '';
    const agPlural = /^(?:Les|Des|Ces)\s/.test(agDet);
    // verbe : « a/ont + participe » ou forme simple (présent, imparfait, futur)
    let lemma, tense;
    const pc = /^(a|ont)\s+(\S+)$/.exec(vb);
    if (pc) {
      if ((pc[1] === 'ont') !== agPlural) return null;
      const info = LEX.part.get(pc[2]);
      if (!info || info.amb || info.g !== 'm' || info.n !== 's') return null;   // forme « masculin singulier » exigée après « avoir »
      lemma = info.lemma; tense = 'pc';
    } else {
      const cands = (LEX.finite.get(vb) || []).filter((c) => c.plural === agPlural);
      if (cands.length !== 1) return null;                                          // forme absente ou ambiguë : on s'abstient
      lemma = cands[0].lemma; tense = cands[0].tense;
    }
    if (NO_PASSIVE.has(lemma)) return null;
    const f = LEX.lem.get(lemma);
    // complément d'objet : genre connu (dictionnaire) et nombre donné par le déterminant
    const g = LEX.genre.get(noun.toLowerCase());
    if (!f || !g) return null;
    const obPlural = /^(?:les|des|ces|ses|nos)\s/.test(obDet);
    const pa = f.par[g + (obPlural ? 'p' : 's')];
    if (!pa) return null;
    const aux = tense === 'pres' ? (obPlural ? 'sont' : 'est')
      : tense === 'imp' ? (obPlural ? 'étaient' : 'était')
        : tense === 'fut' ? (obPlural ? 'seront' : 'sera')
          : (obPlural ? 'ont été' : 'a été');
    const by = agDet.charAt(0).toLowerCase() + agDet.slice(1);
    return cap1(obDet + noun) + ' ' + aux + ' ' + pa + ' par ' + by + agHead + tail + '.';
  }

  return { VERSION, MAX_CHARS, syllables, syllablesRules, setLexique, lexiqueChargee, humanize, review, assemble, analyze, quality, suggest, reformuler, compose, patchCheck, countWords, splitSentences, jaccard, bigrams };
});
