/* Humanizzer IA Steph : suite de tests n° 2 (v1.5)
   Tourne dans le NAVIGATEUR (page tests.html) comme dans Node : elle sert à vérifier l'application sur VOTRE appareil.
   Chaque test correspond à un défaut réel trouvé lors de l'audit du 31 oct. 2026. */
(function (root) {
  'use strict';

  function runTests(H, Lex) {
    const results = [];
    const t = (name, fn) => {
      try { fn(); results.push({ name, pass: true, details: '' }); }
      catch (e) { results.push({ name, pass: false, details: String(e && e.message ? e.message : e) }); }
    };
    const eq = (a, b, msg) => {
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg ? msg + ' : ' : '') + 'attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a));
    };
    const ok = (c, msg) => { if (!c) throw new Error(msg || 'assertion fausse'); };
    const avecDico = (fn) => { H.setLexique(Lex || null); fn(); };
    const sansDico = (fn) => { H.setLexique(null); try { fn(); } finally { H.setLexique(Lex || null); } };
    const hz = (s) => H.humanize(s).text;
    const norm = (s) => s.replace(/\s+/g, ' ').trim();

    /* ---------- compatibilité du navigateur ---------- */
    t('Navigateur : String.normalize, matchAll, Int32Array, classes Unicode \\p{L}', () => {
      ok(typeof 'a'.normalize === 'function' && typeof ''.matchAll === 'function' && typeof Int32Array === 'function', 'API manquante');
      ok(/\p{L}/u.test('é'), 'propriétés Unicode (\\p{L}) non supportées');
    });
    t('Navigateur : le moteur est chargé (version 1.5)', () => { ok(H && /^1\.5\./.test(H.VERSION), 'version ' + (H && H.VERSION)); });
    t('Dictionnaire : le fichier lexique-data.js est chargé et complet', () => {
      ok(Lex, 'lexique-data.js non chargé (hors ligne ? fichier absent ?)');
      ok(Lex.syl && Lex.genre && Lex.verbs && Lex.verbs.reg.length > 10000 && Lex.genre.f.length > 10000, 'données incomplètes');
      ok(Lex.verbs.irr.faire && /^fait,font,faisait,faisaient,fera,feront;/.test(Lex.verbs.irr.faire), 'conjugaison de « faire » incorrecte');
    });

    /* ---------- règles : corrections de l'audit ---------- */
    t('1.5 « Bien sûr ! » (espace avant « ! ») supprimé', () => { eq(hz('Bien sûr ! La réponse est oui.'), 'La réponse est oui.'); });
    t('2.6 plages et noms composés en demi-cadratin intacts', () => {
      eq(hz('Pages 10–20 et 30–40.'), 'Pages 10–20 et 30–40.');
      eq(hz('La cinétique de Michaelis–Menten.'), 'La cinétique de Michaelis–Menten.');
    });
    t('2.7 flèches de réaction intactes', () => { eq(hz('A + B → C puis C → D'), 'A + B → C puis C → D'); });
    t('1.3 « l’essentiel » jamais cassé ; « absolument pas » intact', () => {
      eq(hz("L'essentiel est de mesurer."), "L'essentiel est de mesurer.");
      eq(hz("Ce n'est absolument pas le cas."), "Ce n'est absolument pas le cas.");
    });
    t('1.3 pluriels en -aux (cruciaux, fondamentaux)', () => { eq(hz('des points cruciaux et fondamentaux'), 'des points décisifs et centraux'); });
    t('2.3 aucune clause contenant un chiffre n’est supprimée', () => {
      const s = 'Les ventes montent, contribuant à 40 % de la hausse totale.';
      eq(hz(s), s);
    });
    t('Unicode : accents décomposés (copier-coller PDF) traités comme composés', () => {
      eq(hz('Un point indéniable.'.normalize('NFD')), 'Un point évident.');
    });
    t('Robustesse : texte trop long refusé proprement, entrée vide acceptée', () => {
      let leve = false;
      try { H.humanize('a'.repeat(H.MAX_CHARS + 1)); } catch (e) { leve = e instanceof RangeError; }
      ok(leve, 'RangeError attendue');
      eq(H.humanize('').text, '');
    });

    /* ---------- relecture modification par modification ---------- */
    const T1 = "L'essentiel est crucial. Bien sûr ! Le modèle — le plus large du réseau — grandit, soulignant une tendance. De plus, le coût baisse. Des points cruciaux restent ouverts.";
    t('Relecture : 6 modifications indépendantes, chacune avec sa règle', () => {
      const r = H.review(T1);
      const chg = r.segments.filter((s) => !s.same);
      eq(chg.length, 6);
      eq(chg.map((s) => s.orig.trim()), ['crucial', 'Bien sûr !', '— le plus large du réseau —', ', soulignant une tendance', 'De plus,', 'cruciaux']);
      ok(chg[1].label.indexOf('chatbot') !== -1 && chg[4].label.indexOf('Transition') !== -1);
    });
    t('Relecture : accepter tout = résultat de humanize()', () => {
      const r = H.review(T1);
      eq(H.assemble(r.segments), r.text);
    });
    t('Relecture : refuser tout restitue le texte d’origine À L’IDENTIQUE', () => {
      const r = H.review(T1);
      eq(H.assemble(r.segments, r.segments.map(() => false)), T1);
    });
    t('Relecture : refuser UNE modification n’affecte pas les autres', () => {
      const r = H.review(T1);
      const acc = r.segments.map(() => true);
      acc[r.segments.findIndex((s) => !s.same && /Bien sûr/.test(s.orig))] = false;
      eq(H.assemble(r.segments, acc),
        "L'essentiel est décisif. Bien sûr ! Le modèle (le plus large du réseau) grandit. Et le coût baisse. Des points décisifs restent ouverts.");
    });
    t('Relecture : l’incise « — … — » reste UNE modification', () => {
      const r = H.review('Le modèle — le plus large du réseau — grandit.');
      eq(r.segments.filter((s) => !s.same).length, 1);
    });
    t('Relecture : 600 modifications relues une à une (l’ancien plafond était de 500)', () => {
      const base = 'Le modèle est testé. De plus, le point est crucial et les résultats restent partiels. ';
      const src = base.repeat(300);
      const r = H.review(src);
      ok(r.segments, 'relecture désactivée à tort');
      ok(r.modifications >= 600, r.modifications + ' modifications');
      eq(H.assemble(r.segments), r.text);
      eq(norm(H.assemble(r.segments, r.segments.map(() => false))), norm(src));
    });

    /* ---------- syllabes ---------- */
    t('Syllabes (règles seules) : « chaque », « voyait », « payer » corrigés', () => sansDico(() => {
      eq([H.syllables('chaque'), H.syllables('voyait'), H.syllables('payer'), H.syllables('musique')], [1, 2, 2, 2]);
    }));
    t('Syllabes (règles seules) : mots techniques absents du dictionnaire', () => sansDico(() => {
      eq([H.syllables('chromatographie'), H.syllables('phytoremédiation'), H.syllables('spectrophotométrie'), H.syllables('métabolites')], [5, 6, 6, 4]);
    }));
    t('Syllabes (dictionnaire) : mots où les règles se trompent (médecin, pays, blanche…)', () => avecDico(() => {
      ok(H.lexiqueChargee(), 'dictionnaire non chargé');
      const att = { médecin: 2, pays: 2, blanche: 2, essayer: 3, voyez: 2, quelque: 1, croyais: 2, ok: 2, jouons: 1, table: 1, concentration: 4, biochimique: 3 };
      const mauvais = Object.keys(att).filter((w) => H.syllables(w) !== att[w]);
      eq(mauvais, []);
    }));
    t('Qualité : Flesch français = 207 − 1,015·mots/phrase − 73,6·syllabes/mot', () => sansDico(() => {
      const q = H.quality('Le chat dort. Il mange. Nous lisons.');
      const attendu = 207 - 1.015 * (7 / 3) - 73.6 * (8 / 7);
      ok(Math.abs(q.readability.score - attendu) < 0.2, q.readability.score + ' vs ' + attendu.toFixed(1));
      eq(q.readability.reliable, false);
    }));
    t('Qualité : « l’étude » compte pour UN mot', () => sansDico(() => {
      eq(H.quality("L'étude de l'enzyme. Le test.").words, 5);
    }));
    t('Qualité : MATTR insensible à la longueur du texte', () => {
      const c = H.quality('a b c d e f g h '.repeat(15)).lexical.mattr, l = H.quality('a b c d e f g h '.repeat(60)).lexical.mattr;
      ok(Math.abs(c - l) < 0.01, c + ' vs ' + l);
    });

    /* ---------- suggestions de style ---------- */
    t('Suggestions : pléonasmes et anglicismes ; « initier » libre en sciences', () => {
      eq(H.suggest("Au jour d'aujourd'hui, il faut initier un nouveau projet.").map((x) => x.found.toLowerCase()), ["au jour d'aujourd'hui", 'initier un nouveau projet']);
      eq(H.suggest("Le facteur permet d'initier la transcription et une réaction chimique."), []);
    });

    /* ---------- voix active / passive ---------- */
    const voix = (s) => H.reformuler(s, '', '').items[0].variants.filter((v) => /^Voix/.test(v.type)).map((v) => v.text);
    t('Voix passive → active (avec dictionnaire, verbes irréguliers compris)', () => avecDico(() => {
      eq(voix('Les résultats ont été obtenus par les chercheurs.'), ['Les chercheurs ont obtenu les résultats.']);
      eq(voix("La méthode a été décrite par l'équipe."), ["L'équipe a décrit la méthode."]);
      eq(voix('Les données seront recueillies par les participants.'), ['Les participants recueilleront les données.']);
      eq(voix("L'échantillon est prélevé par les médecins."), ["Les médecins prélèvent l'échantillon."]);
    }));
    t('Voix active → passive : accord avec le genre et le nombre du complément', () => avecDico(() => {
      eq(voix('Les chercheurs mesurent la concentration.'), ['La concentration est mesurée par les chercheurs.']);
      eq(voix("L'équipe a analysé les extraits après traitement."), ['Les extraits ont été analysés par l\'équipe après traitement.']);
      eq(voix('Les participants ont collecté les données.'), ['Les données ont été collectées par les participants.']);
      eq(voix('Le laboratoire appliquera le protocole.'), ['Le protocole sera appliqué par le laboratoire.']);
      eq(voix('Les experts considèrent les cellules.'), ['Les cellules sont considérées par les experts.']);
    }));
    t('Voix : les deux sens sont réciproques', () => avecDico(() => {
      ['Les chercheurs ont obtenu les résultats.', "L'équipe a décrit la méthode.", 'Les chercheurs extraient les enzymes.'].forEach((a) => {
        const p = voix(a)[0];
        ok(p, 'pas de passif pour ' + a);
        eq(voix(p), [a], 'aller-retour de « ' + a + ' »');
      });
    }));
    t('Voix : abstention si genre ambigu (« livre »), nom inconnu, adjectif, verbe « avoir », sujet non humain', () => avecDico(() => {
      eq(voix('Les chercheurs mesurent le livre.'), []);
      eq(voix('Les chercheurs mesurent la phytoremédiation.'), []);
      eq(voix('Les chercheurs mesurent la concentration élevée.'), []);
      eq(voix('Les chercheurs ont les résultats.'), []);
      eq(voix('Le test mesure la dose.'), []);
      eq(voix('Les extraits sont obtenus par la filtration.'), []);
    }));
    t('Voix : sans dictionnaire, pas de passif et pas d’irréguliers (abstention, jamais d’erreur)', () => sansDico(() => {
      eq(voix('Les chercheurs mesurent la concentration.'), []);
      eq(voix('Les résultats ont été obtenus par les chercheurs.'), []);
      eq(voix('Les extraits sont analysés par les chercheurs.'), ['Les chercheurs analysent les extraits.']);
    }));

    return results;
  }

  const api = { runTests };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HumanizzerTests2 = api;
})(typeof self !== 'undefined' ? self : this);
