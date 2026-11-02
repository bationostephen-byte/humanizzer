/* Exécute les deux suites dans la page tests.html et affiche le résultat (fichier séparé : compatible CSP stricte). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var H = window.Humanizzer;
  if (!H) {
    var e = $('erreur-moteur');
    e.style.display = 'block';
    e.textContent = 'Le moteur (engine.js) n’a pas pu se charger : navigateur trop ancien (Safari avant 16.4, par exemple) ou fichier manquant. Ouvrez la console (F12) pour le détail.';
    $('resume').style.display = 'none';
    return;
  }
  var Lex = window.HumanizzerLexique || null;
  $('env').textContent = 'Navigateur : ' + navigator.userAgent + ' · moteur v' + H.VERSION + ' · dictionnaire : ' + (Lex ? 'chargé (' + Lex.version + ')' : 'ABSENT');

  H.setLexique(Lex);
  var r1 = window.HumanizzerTests.runTests(H);
  H.setLexique(Lex);
  var r2 = window.HumanizzerTests2.runTests(H, Lex);

  function afficher(corps, results, offset) {
    results.forEach(function (r, i) {
      var tr = document.createElement('tr');
      var cells = [String(offset + i + 1), r.pass ? 'OK' : 'ÉCHEC', r.name, r.details || ''];
      cells.forEach(function (txt, k) {
        var td = document.createElement('td');
        td.textContent = txt;
        if (k === 1) td.className = r.pass ? 'ok' : 'ko';
        if (k === 3) td.className = 'details';
        tr.appendChild(td);
      });
      corps.appendChild(tr);
    });
  }
  afficher($('corps1'), r1, 0);
  afficher($('corps2'), r2, 0);
  var all = r1.concat(r2), ok = all.filter(function (r) { return r.pass; }).length;
  var resume = $('resume');
  resume.className = 'resume ' + (ok === all.length ? 'tout-ok' : 'des-echecs');
  resume.textContent = ok + ' / ' + all.length + ' tests réussis' + (ok === all.length ? ' : tout fonctionne sur cet appareil.' : ' : des corrections sont nécessaires.');
})();
