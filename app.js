/* Humanizzer IA Steph — logique d'interface */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const H = window.Humanizzer;
  if (!H) {
    // engine.js absent ou non parsé (ex. Safari < 16.4) : message clair au lieu d'une interface morte
    document.body.insertAdjacentHTML('afterbegin', '<div class="erreur-msg">Le moteur de réécriture (engine.js) n’a pas pu se charger. Causes fréquentes : navigateur trop ancien (Safari avant 16.4, par exemple) ou fichier manquant. Mettez le navigateur à jour, ou ouvrez la console (F12) pour le détail.</div>');
    return;
  }
  // Toute erreur levée par le moteur (texte trop long, bug) s'affiche au lieu de rester silencieuse dans la console
  const safe = (fn) => function () {
    try { return fn.apply(this, arguments); } catch (e) {
      console.error(e);
      alert(e instanceof RangeError ? e.message : 'Erreur inattendue : ' + e.message);
    }
  };
  const on = (id, fn) => $(id).addEventListener('click', safe(fn));

  /* ---------- navigation ---------- */
  const navTests = $('nav-tests');
  if (navTests) {
    navTests.addEventListener('click', () => { location.href = 'tests.html'; });
  }
  document.querySelectorAll('nav button[data-vue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav button').forEach((b) => b.classList.remove('actif'));
      btn.classList.add('actif');
      document.querySelectorAll('section.vue').forEach((s) => s.classList.remove('actif'));
      $('vue-' + btn.dataset.vue).classList.add('actif');
    });
  });

  /* ---------- mode 1 : humaniser ---------- */
  const historique = []; // pile de textes pour "annuler la dernière"
  function lireCategories() {
    const ids = ['banned', 'transitions', 'periphrases', 'chatbot', 'participes', 'emdash', 'arrow', 'register'];
    const cats = {};
    ids.forEach((id) => { cats[id] = $('cat-' + id).checked; });
    return cats;
  }

  on('hz-lancer', () => {
    const txt = $('hz-entree').value;
    if (!txt.trim()) { alert('Collez d\'abord un texte à corriger.'); return; }
    historique.push(txt);
    $('hz-annuler').disabled = false;
    const cats = lireCategories();
    const r = H.humanize(txt, cats);
    $('hz-resultats').style.display = 'block';
    $('hz-sortie').value = r.text;
    $('hz-score').textContent = 'Conformité : ' + r.before.score + ' → ' + r.after.score + ' / 100';
    $('hz-metriques').textContent = r.after.words + ' mots · ' + r.after.sentences + ' phrases · longueur moyenne ' + r.after.avgLen + ' mots (écart-type ' + r.after.stdev + ') · extrêmes ' + r.after.minLen + '–' + r.after.maxLen;
    const j = $('hz-journal');
    j.innerHTML = '';
    if (r.log.length === 0) {
      j.innerHTML = '<div>Aucune modification nécessaire : le texte respecte déjà les règles activées.</div>';
    }
    r.log.forEach((e) => {
      const d = document.createElement('div');
      d.innerHTML = '<b>' + echap(e.label) + '</b><br>« ' + echap(e.before) + ' » → « ' + echap(e.after) + ' »';
      j.appendChild(d);
    });
    // Tout ce qui reste après correction est montré : cas ambigus laissés intacts, catégories désactivées, règles manuelles
    const restants = r.after.violations;
    const zone = $('hz-restants');
    if (restants.length === 0) {
      zone.innerHTML = '<div class="avert" style="background:var(--accent-clair);border-color:var(--accent)">Rien à signaler : aucune règle manuelle enfreinte détectée.</div>';
    } else {
      zone.innerHTML = '<b style="font-size:.9rem">À revoir à la main :</b>' + restants.map((v) =>
        '<div class="avert"><b>' + echap(v.label) + '</b> — ' + v.count + ' occurrence(s). ' +
        echap(v.fixable
          ? (cats[v.id] === false ? 'Catégorie désactivée : non corrigée.' : 'Non corrigé automatiquement (chiffre, élision ou contexte ambigu) : relisez et corrigez à la main.')
          : conseil(v.id)) + '</div>').join('');
    }
  });

  function conseil(id) {
    const m = {
      cliche: 'Remplacez par le sujet direct, un fait surprenant, une question concrète ou une anecdote.',
      vague: 'Nommez la source exacte (auteur, année) ou supprimez l\'affirmation.',
      triades: 'Ne listez pas toujours 3 éléments : gardez-en 2, 4 ou 1.',
      ps: 'Réécrivez la phrase proprement si le contenu a de la valeur, sinon supprimez-la.',
      series: 'Mélangez les longueurs : une phrase courte, puis un paragraphe qui développe.',
      lists: 'Maximum 2 listes par 500 mots : transformez le reste en prose.',
      bold: 'Maximum 10 à 15 éléments en gras pour 2 500 mots.',
      arrowu: 'Une flèche « → » en prose se remplace par une phrase ; gardez-la dans une équation de réaction.',
    };
    return m[id] || '';
  }

  function echap(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  $('hz-annuler').addEventListener('click', () => {
    if (historique.length === 0) return;
    $('hz-entree').value = historique.pop();
    $('hz-annuler').disabled = historique.length === 0;
    $('hz-resultats').style.display = 'none';
  });
  $('hz-reset').addEventListener('click', () => {
    $('hz-entree').value = ''; $('hz-sortie').value = '';
    $('hz-resultats').style.display = 'none';
    historique.length = 0; $('hz-annuler').disabled = true;
  });
  $('hz-copier').addEventListener('click', () => copier($('hz-sortie')));
  $('rf-copier').addEventListener('click', () => copier($('rf-sortie')));
  function copier(zone) {
    zone.select();
    const ok = () => {
      zone.style.background = 'var(--accent-clair)';
      setTimeout(() => { zone.style.background = ''; }, 600);
    };
    const repli = () => { try { if (document.execCommand('copy')) ok(); } catch (_) { /* Ctrl+C manuel */ } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(zone.value).then(ok, repli);
    else repli();
  }
  $('hz-telecharger').addEventListener('click', () => {
    const blob = new Blob([$('hz-sortie').value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'texte-humanise-steph.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ---------- mode 2 : reformuler ---------- */
  let dernierResultat = null;
  on('rf-lancer', () => {
    const txt = $('rf-entree').value;
    if (!txt.trim()) { alert('Collez d\'abord l\'extrait de la source.'); return; }
    dernierResultat = H.reformuler(txt, $('rf-source').value, $('rf-termes').value);
    $('rf-resultats').style.display = 'block';
    const alertes = $('rf-alertes');
    alertes.innerHTML = dernierResultat.warns.map((w) => '<div class="avert">' + echap(w) + '</div>').join('');
    const zone = $('rf-phrases');
    zone.innerHTML = '';
    dernierResultat.items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'variante';
      div.dataset.index = item.i;
      const titre = document.createElement('div');
      titre.innerHTML = '<b>Phrase ' + (item.i + 1) + '</b> <span class="type">' +
        (item.canMergeWithPrev ? '(fusionnable avec la phrase ' + item.i + ')' : '') + '</span>';
      const orig = document.createElement('p');
      orig.style.margin = '4px 0';
      orig.innerHTML = '<span class="type">Original :</span> ' + echap(item.original);
      div.appendChild(titre);
      div.appendChild(orig);
      if (item.variants.length === 0) {
        const p = document.createElement('p');
        p.className = 'type';
        p.textContent = 'Aucune variante de structure automatique pour cette phrase ; reformulez-la à la main en changeant le sujet grammatical ou l\'ordre des propositions.';
        div.appendChild(p);
      }
      item.variants.forEach((v, k) => {
        const ligne = document.createElement('div');
        const badges = [];
        if (!v.ok) badges.push('<span class="badge ko">chiffre ou terme manquant</span>');
        if (v.patch) badges.push('<span class="badge atten">charpente proche</span>');
        if (v.ok && !v.patch) badges.push('<span class="badge ok">chiffres et termes présents</span>');
        const btn = document.createElement('button');
        btn.className = 'action secondaire';
        btn.textContent = 'Utiliser';
        v.btn = btn;
        btn.addEventListener('click', () => {
          const items = dernierResultat.items;
          const dejaChoisi = item.chosen === v;
          item.chosen = dejaChoisi ? null : v;
          if (item.chosen) {
            // une fusion consomme la phrase suivante : on écarte les choix qui entrent en conflit
            if (item.chosen.fusion && items[item.i + 1]) items[item.i + 1].chosen = null;
            const prev = items[item.i - 1];
            if (prev && prev.chosen && prev.chosen.fusion) prev.chosen = null;
          }
          items.forEach((it) => it.variants.forEach((x) => { x.btn.textContent = it.chosen === x ? 'Utilisé ✓' : 'Utiliser'; }));
          composer();
        });
        ligne.innerHTML = '<span class="type">Variante ' + (k + 1) + ' · ' + echap(v.type) + '</span> ' + badges.join(' ');
        const p = document.createElement('p');
        p.style.margin = '4px 0';
        p.textContent = v.text;
        ligne.appendChild(p);
        ligne.appendChild(btn);
        div.appendChild(ligne);
      });
      zone.appendChild(div);
    });
    composer();
  });

  function composer() {
    if (!dernierResultat) return;
    $('rf-sortie').value = H.compose(dernierResultat.items);
  }

  on('rf-verifier', () => {
    const extrait = $('rf-extrait').value;
    const reformule = $('rf-sortie').value || $('rf-entree').value;
    if (!extrait.trim()) { alert('Collez l\'extrait original de la source pour comparaison.'); return; }
    const r = H.patchCheck(extrait, reformule);
    const cls = r.reliable === false ? 'avert' : (r.distance > 0.6 ? 'erreur-msg' : (r.distance > 0.4 ? 'avert' : ''));
    $('rf-patch').innerHTML =
      '<div class="' + cls + '"><b>Indice de proximité :</b> ' + r.distance +
      ' (0 = très éloigné, 1 = copie identique ; maximum entre le Jaccard des bigrammes : ' + r.jaccard +
      ' et la part des 4-grammes de la source repris tels quels : ' + r.containment + ')' +
      ' · <b>ratio de longueur :</b> ' + r.ratio + '<br>' + echap(r.verdict) + '</div>';
  });

  /* ---------- mode 3 : analyser ---------- */
  on('an-lancer', () => {
    const txt = $('an-entree').value;
    if (!txt.trim()) { alert('Collez d\'abord un texte à auditer.'); return; }
    const a = H.analyze(txt);
    $('an-resultats').style.display = 'block';
    $('an-score').textContent = 'Conformité : ' + a.score + ' / 100';
    $('an-metriques').textContent = a.words + ' mots · ' + a.sentences + ' phrases · longueur moyenne ' + a.avgLen + ' mots (écart-type ' + a.stdev + ') · extrêmes ' + a.minLen + '–' + a.maxLen + ' mots';
    const tbody = $('an-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (a.violations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">Aucune infraction détectée. Le texte respecte toutes les règles vérifiables automatiquement.</td></tr>';
    }
    a.violations.forEach((v) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + echap(v.label) + '</b></td><td>' + v.count + (v.excess ? ' (excès : ' + v.excess + ')' : '') + '</td><td>' +
        (v.fixable ? '<span class="badge ok">correction automatique (onglet Humaniser)</span>' : '<span class="badge atten">à la main : ' + echap(conseil(v.id)) + '</span>') + '</td>';
      tbody.appendChild(tr);
    });
  });
})();
