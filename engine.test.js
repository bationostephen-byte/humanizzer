/* Tests de non-régression — Humanizzer IA Steph (audit du 31 oct. 2026)
   Exécution : node --test engine.test.js        (Node 18+, aucune dépendance)
   Chaque test correspond à un défaut reproduit lors de l'audit. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./engine.js');
const T = require('./tests.js');

const hz = (t, c) => H.humanize(t, c).text;
const ids = (t) => H.analyze(t).violations.map((v) => v.id);

/* ---------- 0. la suite historique (54 tests du navigateur) tourne aussi en CI ---------- */
test('suite historique tests.js : 54/54', () => {
  const res = T.runTests(H);
  const ko = res.filter((r) => !r.pass).map((r) => r.name + ' → ' + r.details);
  assert.deepEqual(ko, []);
  assert.equal(res.length, 54);
});

/* ---------- 1. règles qui corrompaient le contenu ---------- */
test('1.5 « Bien sûr ! » avec espace avant le point d’exclamation (typographie française)', () => {
  assert.equal(hz('Bien sûr ! La réponse est oui.'), 'La réponse est oui.');
  assert.equal(hz('Bien sûr\u00A0! La réponse est oui.'), 'La réponse est oui.'); // espace insécable
  assert.equal(hz('Absolument ! Le test passe.'), 'Le test passe.');
});
test('1.5 « Voici un aperçu : … » retire l’annonce, pas le contenu', () => {
  assert.equal(hz('Voici un aperçu des résultats : le taux est de 43 %.'), 'Le taux est de 43 %.');
});
test('2.6 les plages et noms composés en demi-cadratin sont intacts', () => {
  assert.equal(hz('Voir pp. 10–20 et 7,2–7,8 ppm.'), 'Voir pp. 10–20 et 7,2–7,8 ppm.');
  assert.equal(hz('Pages 10–20 et 30–40.'), 'Pages 10–20 et 30–40.');
  assert.equal(hz('La cinétique de Michaelis–Menten et la paire Watson–Crick.'), 'La cinétique de Michaelis–Menten et la paire Watson–Crick.');
});
test('2.6 le tiret cadratin espacé reste corrigé (incise et isolé)', () => {
  assert.equal(hz('Le modèle — le seul testé — échoue ici.'), 'Le modèle (le seul testé) échoue ici.');
  assert.equal(hz('Le modèle – le seul testé – échoue ici.'), 'Le modèle (le seul testé) échoue ici.');
  assert.equal(hz('App : rédaction — mieux que rien.'), 'App : rédaction, mieux que rien.');
});
test('2.6 une plage numérique espacée « 10 – 20 » n’est pas touchée', () => {
  assert.equal(hz('Entre 10 – 20 mg.'), 'Entre 10 – 20 mg.');
});
test('2.7 les flèches de réaction et « <-> » ne sont pas réécrites ; les listes à flèches le sont', () => {
  assert.equal(hz('A + B → C puis C → D'), 'A + B → C puis C → D');
  assert.equal(hz('A <-> B'), 'A <-> B');
  assert.equal(hz('le plan -> trois axes'), 'le plan : trois axes');
  assert.ok(!/->/.test(hz('Les axes :\n-> vitesse\n-> coût')));
  assert.ok(ids('A + B → C').includes('arrowu') === true, 'la flèche en prose doit rester signalée');
});
test('1.3 élision : « l’essentiel » n’est jamais cassé en « l’nécessaire »', () => {
  const out = hz("L'essentiel est de mesurer. Allons à l'essentiel.");
  assert.equal(out, "L'essentiel est de mesurer. Allons à l'essentiel.");
  assert.ok(ids(out).includes('banned'), 'reste signalé pour relecture manuelle');
  assert.equal(hz('Un point essentiel.'), 'Un point nécessaire.'); // le cas simple marche toujours
});
test('1.3 « absolument pas / rien / jamais » ne devient pas « tout à fait pas »', () => {
  assert.equal(hz("Ce n'est absolument pas le cas."), "Ce n'est absolument pas le cas.");
  assert.equal(hz('Il n’y a absolument rien.'), 'Il n’y a absolument rien.');
  assert.equal(hz('Un résultat absolument net.'), 'Un résultat tout à fait net.');
});
test('1.3 pluriels masculins en -aux (cruciaux, fondamentaux, primordiaux, optimaux)', () => {
  assert.equal(hz('des points cruciaux'), 'des points décisifs');
  assert.equal(hz('des principes fondamentaux'), 'des principes centraux');
  assert.equal(hz('des enjeux primordiaux'), 'des enjeux majeurs');
  assert.equal(hz('des seuils optimaux'), 'des seuils idéaux');
  assert.ok(!ids(hz('des points cruciaux')).includes('banned'));
});
test('1.3 « je mets en lumière » → « je montre » (bonne personne)', () => {
  assert.equal(hz('Je mets en lumière un biais.'), 'Je montre un biais.');
});
test('2.3 une proposition participiale contenant un chiffre n’est jamais supprimée', () => {
  const src = 'Les ventes montent, contribuant à 40 % de la hausse totale.';
  assert.equal(hz(src), src);
  assert.ok(ids(src).includes('participes'), 'reste signalée');
  assert.equal(hz('Les ventes montent, reflétant une demande forte.'), 'Les ventes montent.');
});
test('1.2 « Dans l’ensemble, » est aussi supprimé après deux-points', () => {
  const out = hz("Conclusion : dans l'ensemble, le modèle tient.");
  assert.equal(out, 'Conclusion : le modèle tient.');
  assert.ok(!ids(out).includes('transitions'));
});

/* ---------- 2. Unicode et robustesse ---------- */
test('Unicode : un texte en NFD (copier-coller PDF/macOS) est traité comme du NFC', () => {
  const nfd = 'Un point indéniable.'.normalize('NFD');
  assert.notEqual(nfd, 'Un point indéniable.'.normalize('NFC')); // le piège est réel
  assert.equal(hz(nfd), 'Un point évident.');
});
test('Entrée : null/undefined/nombre ne plantent pas', () => {
  assert.equal(H.humanize(null).text, '');
  assert.equal(H.analyze(undefined).words, 0);
  assert.equal(H.humanize(12345).text, '12345');
});
test('Entrée : un texte au-delà de MAX_CHARS lève une RangeError explicite', () => {
  assert.throws(() => H.humanize('a'.repeat(H.MAX_CHARS + 1)), RangeError);
  assert.throws(() => H.reformuler('a'.repeat(H.MAX_CHARS + 1), '', ''), RangeError);
});
test('Performance : séquence collée sans espace (120 000 caractères) analysée en < 1 s', () => {
  const dna = 'ATGC'.repeat(30000);
  const t0 = process.hrtime.bigint();
  H.analyze(dna);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1000, 'durée : ' + ms.toFixed(0) + ' ms (avant correctif : ~8 200 ms)');
});
test('Performance : 50 000 mots de prose humanisés en < 2 s', () => {
  const txt = 'Le modèle est testé sur des données réelles, mais les résultats restent partiels, et le biais demeure. '.repeat(2800);
  const t0 = process.hrtime.bigint();
  H.humanize(txt);
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 2000);
});
test('Compatibilité : aucun lookbehind dans le moteur (Safari < 16.4 ne parse pas « (?<= »)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
  assert.ok(!/\(\?<[=!]/.test(src), 'lookbehind détecté dans engine.js');
});
test('Idempotence : un 2e passage ne modifie plus rien (corpus varié)', () => {
  const corpus = [
    "L'essentiel est crucial. De plus, le réseau — le plus large — grandit, soulignant une tendance.",
    'Voici un aperçu : le taux est de 43 %. Bien sûr ! Pages 10–20.',
    'A + B → C. Les axes :\n-> vitesse\n-> coût. Je mets en lumière des points cruciaux.',
    "Conclusion : dans l'ensemble, c'est absolument pas simple. Afin de mesurer, on teste.",
  ];
  for (const c of corpus) {
    const first = H.humanize(c);
    assert.equal(H.humanize(first.text).log.length, 0, 'non idempotent sur : ' + first.text);
  }
});
test('Découpage : « 3 m. » n’est pas une abréviation ; « et al. » et « p. » le restent', () => {
  assert.equal(H.splitSentences('Le tube mesure 3 m. Le poids est faible.').length, 2);
  assert.equal(H.splitSentences('Selon Martin et al. (2022, p. 14), le composé agit.').length, 1);
});

/* ---------- 3. reformuler : variantes grammaticalement sûres ---------- */
const textes = (s) => H.reformuler(s, 'X (2020)', '').items.flatMap((i) => i.variants.map((v) => v.text));
test('Reformuler : « Il y a eu une étude qui… » ne produit pas « Eu une étude… »', () => {
  assert.deepEqual(textes('Il y a eu une étude qui a montré un effet net.'), []);
  assert.deepEqual(textes('Il y a trois ans, un chercheur qui travaillait ici est parti.'), []);
});
test('Reformuler : pas de dédoublement qui laisse un fragment subordonné (« Alors que… »)', () => {
  assert.deepEqual(textes('Les résultats sont partiels sur les enfants, alors que les adultes sont bien couverts.'), []);
});
test('Reformuler : pas de fusion qui minusculise un acronyme ou un nom propre', () => {
  assert.deepEqual(textes('Le test est fait. ADN reste stable.'), []);
  assert.deepEqual(textes('Le test est fait. Pasteur a conclu.'), []);
  assert.deepEqual(textes('Le test est fait. Il reste fragile.'), ['Le test est fait, il reste fragile.']);
});

/* ---------- 4. compose() : aucune phrase ne disparaît, paragraphes conservés ---------- */
test('compose : deux fusions chaînées ne font plus disparaître de phrase', () => {
  const r = H.reformuler('Le test est fait. Il reste fragile. La suite arrive vite. Fin du texte.', 'X (2020)', '');
  r.items[0].chosen = r.items[0].variants.find((v) => v.fusion);
  r.items[1].chosen = r.items[1].variants.find((v) => v.fusion);
  const out = H.compose(r.items);
  assert.ok(out.includes('La suite arrive vite'), 'phrase perdue : ' + out);
  assert.ok(out.includes('Fin du texte'));
});
test('compose : sans aucun choix, le texte est restitué et les paragraphes sont conservés', () => {
  const src = 'Premier paragraphe ici. Deux phrases.\n\nSecond paragraphe ici.';
  assert.equal(H.compose(H.reformuler(src, 'X (2020)', '').items), src);
});
test('compose : une fusion ne traverse pas la frontière d’un paragraphe', () => {
  const r = H.reformuler('Le test est fait.\n\nIl reste fragile.', 'X (2020)', '');
  assert.equal(r.items.flatMap((i) => i.variants).filter((v) => v.fusion).length, 0);
});

/* ---------- 5. patchCheck : plus de fausse assurance ---------- */
const SRC = 'La croissance du commerce en ligne a modifié les habitudes d’achat des ménages urbains de manière durable dans la région étudiée.';
test('patchCheck : source copiée mot pour mot puis noyée dans du texte ajouté → risque élevé', () => {
  const padded = SRC + ' Par ailleurs nous avons ajouté beaucoup de contenu original ici pour diluer la mesure et gonfler le texte final sans rien changer au passage copié plus haut dans le texte lui-même.';
  const r = H.patchCheck(SRC, padded);
  assert.ok(r.distance > 0.6 && /élevé/.test(r.verdict), 'distance = ' + r.distance + ' (avant correctif : 0,4 → « bonne distance »)');
});
test('patchCheck : apostrophe typographique ou droite, NFC ou NFD : même résultat', () => {
  const droite = SRC.replace(/’/g, "'");
  assert.equal(H.patchCheck(SRC, droite).distance, 1);
  assert.equal(H.patchCheck(SRC, SRC.normalize('NFD')).distance, 1);
});
test('patchCheck : texte trop court → mesure déclarée non fiable (et non « bonne distance »)', () => {
  const r = H.patchCheck('Oui', 'Oui');
  assert.equal(r.reliable, false);
  assert.ok(!/Bonne distance/.test(r.verdict));
});
test('patchCheck : reformulation profonde → bonne distance (pas de faux positif)', () => {
  const r = H.patchCheck(SRC, 'Les citadins achètent autrement depuis que la vente par internet se développe durablement.');
  assert.ok(r.distance < 0.4, 'distance = ' + r.distance);
});

/* ---------- 6. v1.3 : transformations de structure sûres, champs facultatifs ---------- */
const PHRASE = "L'analyse biochimique révèle que la concentration en métaux lourds a baissé de 45 % dans les échantillons de sol minier après traitement.";
test('Reformuler v1.3 : aucun champ obligatoire, la phrase reçoit 3 variantes correctes', () => {
  const r = H.reformuler(PHRASE, '', '');
  const t = r.items[0].variants.map((v) => v.text);
  assert.deepEqual(t, [
    "L'analyse biochimique révèle qu'après traitement, la concentration en métaux lourds a baissé de 45 % dans les échantillons de sol minier.",
    "Il ressort de l'analyse biochimique que la concentration en métaux lourds a baissé de 45 % dans les échantillons de sol minier après traitement.",
    "D'après l'analyse biochimique, la concentration en métaux lourds a baissé de 45 % dans les échantillons de sol minier après traitement.",
  ]);
  assert.ok(r.items[0].variants.every((v) => v.ok), 'le « 45 % » doit être conservé');
  assert.equal(r.warns.length, 1);                      // seulement le rappel de source, plus d'alerte « termes »
  assert.ok(/Aucune source/.test(r.warns[0]) && /facultatif/.test(r.warns[0]));
});
test('Reformuler v1.3 : avec ou sans les champs facultatifs, mêmes variantes', () => {
  const a = H.reformuler(PHRASE, 'Compaore (2025)', 'métaux lourds, minier').items[0].variants.map((v) => v.text);
  const b = H.reformuler(PHRASE, '', '').items[0].variants.map((v) => v.text);
  assert.deepEqual(a, b);
});
test('Reformuler v1.3 : tournures « permet de » et complément temporel en tête', () => {
  assert.deepEqual(textes('Les feuilles de Cassia obtusifolia accumulent le plomb dans les racines après trois semaines.'),
    ['Après trois semaines, les feuilles de Cassia obtusifolia accumulent le plomb dans les racines.']);
  assert.ok(textes('La chromatographie sur couche mince permet de séparer les extraits, mais la reproductibilité reste limitée.')
    .includes('Avec la chromatographie sur couche mince, on peut séparer les extraits, mais la reproductibilité reste limitée.'));
});
test('Reformuler v1.3 garde-fous : pas de variante qui change le sens', () => {
  // « dans … » se rapporte à « gènes impliqués », pas au verbe : ne jamais le déplacer en tête
  assert.ok(!textes('Le séquençage permet d’identifier les gènes impliqués dans la tolérance au cadmium.').some((t) => /^Dans /.test(t)));
  assert.deepEqual(textes("L'analyse ne révèle que trois métaux dans le sol après traitement."), []);       // « ne … que » restrictif
  assert.deepEqual(textes("L'analyse ne montre pas que la concentration a baissé après traitement."), []);    // négation
  assert.deepEqual(textes('Pasteur a observé une baisse nette du titre après traitement thermique.'), []);    // nom propre
  assert.deepEqual(textes('Le patient qui reçoit la dose présente une baisse après traitement.'), []);         // relative
  assert.deepEqual(textes('Après traitement, le taux baisse.'), []);                                           // déjà en tête
  assert.ok(!textes('Les chercheurs montrent que la dose augmente.').some((t) => /^Il ressort/.test(t)));      // sujet humain
});

/* ---------- 7. v1.4 : relecture granulaire, qualité, suggestions, voix passive ---------- */
const actives = (s) => H.reformuler(s, '', '').items[0].variants.filter((v) => /passive/.test(v.type)).map((v) => v.text);
test('Voix passive → active : agent humain ou collectif, temps et accords corrects', () => {
  assert.deepEqual(actives('Les extraits sont analysés par les chercheurs.'), ['Les chercheurs analysent les extraits.']);
  assert.deepEqual(actives("La concentration a été mesurée par l'équipe après traitement."), ["L'équipe a mesuré la concentration après traitement."]);
  assert.deepEqual(actives('Le protocole sera appliqué par le laboratoire.'), ['Le laboratoire appliquera le protocole.']);
  assert.deepEqual(actives('Les données ont été collectées par les participants.'), ['Les participants ont collecté les données.']);
  assert.deepEqual(actives('Le plomb était dosé par les techniciens.'), ['Les techniciens dosaient le plomb.']);
  assert.deepEqual(actives("L'échantillon est prélevé par les médecins."), ["Les médecins prélèvent l'échantillon."]);   // prélevé → prélève (è)
  assert.deepEqual(actives("Les protéines étaient mélangées par l'équipe."), ["L'équipe mélangeait les protéines."]);       // -ger → -geait
  assert.deepEqual(actives("L'étude a été menée par l'équipe."), ["L'équipe a mené l'étude."]);
  assert.deepEqual(actives('Les cellules sont considérées par les experts.'), ['Les experts considèrent les cellules.']);   // considéré → considère
});
test('Voix passive → active garde-fous : « par » + moyen, négation, participe irrégulier', () => {
  assert.deepEqual(actives('Les extraits sont obtenus par filtration.'), []);               // moyen sans déterminant
  assert.deepEqual(actives('Les extraits sont obtenus par la filtration.'), []);            // moyen : « La filtration obtient les extraits » serait faux
  assert.deepEqual(actives('Les patients étaient suivis par les médecins.'), []);           // participe en -i : hors périmètre
  assert.deepEqual(actives("Le test n'est pas validé par les experts."), []);               // négation
  assert.deepEqual(actives('Les résultats sont discutés par les auteurs et par les experts.'), []);
});

test('Relecture : accepter tout = humanize(), refuser tout = texte d’origine (corpus varié)', () => {
  const corpus = [
    "L'essentiel est crucial. Bien sûr ! Le modèle — le plus large du réseau — grandit, soulignant une tendance. De plus, le coût baisse. Des points cruciaux restent ouverts.",
    'Voici un aperçu : le taux est de 43 %. Pages 10–20. A -> B.',
    'De plus, il est crucial de noter. Par ailleurs, c’est essentiel ! Bien sûr !',
    '', ' ', 'Un texte propre sans rien à corriger.',
    'Premier paragraphe crucial.\n\nSecond paragraphe — avec incise — et suite.',
  ];
  for (const c of corpus) {
    const rv = H.review(c);
    assert.ok(rv.segments, 'segments manquants pour : ' + JSON.stringify(c));
    assert.equal(H.assemble(rv.segments), rv.text);
    assert.equal(H.assemble(rv.segments, rv.segments.map(() => false)).replace(/\s+/g, ' '), c.trim().replace(/\s+/g, ' '));
  }
});
test('Relecture : l’incise « — … — » est UNE modification ; refuser une modification n’affecte pas les autres', () => {
  const t = "Le modèle — le plus large du réseau — grandit. Des points cruciaux restent ouverts.";
  const rv = H.review(t);
  const chg = rv.segments.map((s, i) => [s, i]).filter(([s]) => !s.same);
  assert.equal(chg.length, 2);                                         // l'incise et « cruciaux », pas davantage
  const acc = rv.segments.map(() => true);
  acc[chg.find(([s]) => /—/.test(s.orig))[1]] = false;                 // je refuse l'incise seulement
  assert.equal(H.assemble(rv.segments, acc), 'Le modèle — le plus large du réseau — grandit. Des points décisifs restent ouverts.');
});
test('Relecture : les modifications séparées d’une phrase sont indépendantes', () => {
  const rv = H.review("Une approche cruciale. Une phrase neutre. Un résultat essentiel.");
  const chg = rv.segments.filter((s) => !s.same);
  assert.equal(chg.length, 2);
  assert.deepEqual(chg.map((s) => s.label), ['Mot interdit remplacé (1.3)', 'Mot interdit remplacé (1.3)']);
});

test('Qualité : Flesch adapté au français = 207 − 1,015·mots/phrase − 73,6·syllabes/mot', () => {
  const q = H.quality('Le chat dort. Il mange. Nous lisons.');
  const syl = ['le', 'chat', 'dort', 'il', 'mange', 'nous', 'lisons'].reduce((a, w) => a + (w === 'lisons' ? 2 : 1), 0);  // mange = 1 (e muet)
  const attendu = 207 - 1.015 * (7 / 3) - 73.6 * (syl / 7);
  assert.ok(Math.abs(q.readability.score - attendu) < 0.2, q.readability.score + ' vs ' + attendu.toFixed(1));
  assert.equal(q.readability.reliable, false);                        // moins de 100 mots : signalé
});
test('Qualité : plus les mots sont longs, plus le score de lisibilité baisse', () => {
  const simple = H.quality('Le chat dort sur le lit. Le chien court dans le jardin. Il fait beau et chaud ce jour.');
  const savant = H.quality('La chromatographie bidimensionnelle différencie spectrophotométriquement des métabolites secondaires. L’interprétation phytochimique nécessite considérablement d’expérimentations complémentaires.');
  assert.ok(simple.readability.score > savant.readability.score + 30);
});
test('Qualité : MATTR — un texte qui se répète est moins riche qu’un texte varié, quelle que soit la longueur', () => {
  const repete = ('le test est bon ' ).repeat(60);
  const vocab = [];
  for (let i = 0; i < 240; i++) vocab.push('mot' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)));  // lettres seules : « motab », « motbb »…
  const varie = vocab.join(' ');
  assert.ok(H.quality(repete).lexical.mattr < 0.15);
  assert.equal(H.quality(varie).lexical.mattr, 1);
  // insensible à la longueur : un texte périodique garde le même MATTR qu'il soit court ou long
  const court = H.quality(('a b c d e f g h ').repeat(15)).lexical.mattr;
  const long = H.quality(('a b c d e f g h ').repeat(60)).lexical.mattr;
  assert.ok(Math.abs(court - long) < 0.01, court + ' vs ' + long);
});
test('Qualité : mots répétés (stopwords exclus, pluriels regroupés) et pistes seulement pour les mots listés', () => {
  const q = H.quality('Le résultat est clair. Les résultats confirment le résultat. Cette plante accumule le zinc. La plante pousse. Une plante résiste. Le zinc est dosé.');
  const mots = q.repeated.map((x) => x.word + ':' + x.count);
  assert.ok(mots.includes('résultat:3') || mots.includes('résultats:3'), mots.join());
  const rep = q.repeated.find((x) => /^résultat/.test(x.word));
  assert.equal(rep.hint.lemma, 'résultat');
  const plante = q.repeated.find((x) => x.word === 'plante');
  assert.equal(plante.count, 3);
  assert.equal(plante.hint, null);                                    // « plante » est un terme de domaine : aucune piste de synonyme
  assert.ok(!q.repeated.some((x) => ['les', 'cette', 'une', 'est'].includes(x.word)));
});
test('Qualité : phrases de 40 mots ou plus repérées', () => {
  const longue = 'mot '.repeat(45).trim() + '.';
  assert.equal(H.quality(longue + ' Courte.').longSentences.length, 1);
  assert.equal(H.quality('Courte phrase ici. Autre phrase courte.').longSentences.length, 0);
});

const sug = (s) => H.suggest(s).map((x) => x.found.toLowerCase());
test('Suggestions : pléonasmes et anglicismes attestés (Académie, OQLF)', () => {
  assert.deepEqual(sug("Au jour d'aujourd'hui, on doit monter en haut."), ["au jour d'aujourd'hui", 'monter en haut']);
  assert.deepEqual(sug('Elles doivent collaborer ensemble, voire même coopérer ensemble, comme par exemple ici.'),
    ['collaborer ensemble', 'voire même', 'coopérer ensemble', 'comme par exemple']);
  assert.deepEqual(sug('Il faut initier un nouveau projet.'), ['initier un nouveau projet']);
  assert.deepEqual(sug("Il met l'emphase sur ce point."), ["met l'emphase"]);
});
test('Suggestions : « s’avérer vrai » et « collaborer ensemble » portent la nuance OQLF', () => {
  const [a] = H.suggest("L'hypothèse s'est avérée vraie.");
  assert.ok(/pas toujours fautif/.test(a.nuance));
  const [b] = H.suggest('Ils vont collaborer ensemble.');
  assert.ok(/clarté/.test(b.nuance));
});
test('Suggestions garde-fou : « initier » reste libre en sciences (réaction, transcription)', () => {
  assert.deepEqual(H.suggest("Le facteur permet d'initier la transcription. L'initiation de la réaction est lente. Il faut initier une réaction chimique."), []);
  assert.deepEqual(H.suggest("L'étudiant a été initié aux techniques de dosage."), []);
});
test('Suggestions : jamais corrigées automatiquement par humanize()', () => {
  const t = "Au jour d'aujourd'hui, il faut collaborer ensemble.";
  assert.equal(H.humanize(t).text, t);
});

/* ---------- 8. v1.5 : suivi d'origine des caractères, dictionnaire Lexique, voix active/passive ---------- */
const LEXDATA = require('./lexique-data.js');
const SUITE2 = require('./tests2.js');

test('Suite portable tests2.js (celle de la page tests.html) : tout passe avec le dictionnaire', () => {
  H.setLexique(LEXDATA);
  try {
    const res = SUITE2.runTests(H, LEXDATA);
    assert.deepEqual(res.filter((r) => !r.pass).map((r) => r.name + ' → ' + r.details), []);
    assert.ok(res.length >= 29);
  } finally { H.setLexique(null); }
});
test('Relecture : fuzz reproductible (600 textes) : accepter tout = humanize(), refuser tout = original à l’identique', () => {
  const pool = ['De plus, le coût baisse.', 'Bien sûr ! La réponse est oui.', "L'essentiel est crucial.", 'Un point essentiel et des cas cruciaux.',
    'Il convient de noter que le taux monte.', 'Le modèle — le plus large du réseau — grandit.', 'Pages 10–20 et A -> B.', 'Le taux baisse, soulignant une tendance.',
    'J’espère que cela vous aide !', 'Voici un aperçu : le plan est simple.', 'Par ailleurs, c’est fondamental.', 'Une phrase neutre sans rien.',
    'Les ventes montent, contribuant à 40 % de la hausse.', 'Dans l’ensemble, tout va bien.', 'Ce n’est absolument pas le cas.', 'Il fait figure de pionnier.',
    "Conclusion : dans l'ensemble, c'est clair.", 'Un texte — avec deux incises — dans la phrase — ici.'];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let mods = 0;
  for (let n = 0; n < 600; n++) {
    const k = 1 + Math.floor(rnd() * 7);
    let txt = pool[Math.floor(rnd() * pool.length)];
    for (let i = 1; i < k; i++) txt += (rnd() < 0.2 ? '\n\n' : rnd() < 0.1 ? '\n' : ' ') + pool[Math.floor(rnd() * pool.length)];
    const r = H.review(txt);
    assert.ok(r.segments, 'segments manquants : ' + JSON.stringify(txt));
    mods += r.modifications;
    assert.equal(H.assemble(r.segments), r.text, 'accepter tout : ' + JSON.stringify(txt));
    assert.equal(H.assemble(r.segments, r.segments.map(() => false)), txt.trim(), 'refuser tout : ' + JSON.stringify(txt));
  }
  assert.ok(mods > 2000);
});
test('Relecture : refuser la suppression « Bien sûr ! » rend aussi son espace (texte d’origine exact)', () => {
  const t = 'Bien sûr ! La réponse est oui. J’espère que cela vous aide !';
  const r = H.review(t);
  assert.equal(r.modifications, 2);
  assert.equal(H.assemble(r.segments, r.segments.map(() => false)), t);
  const acc = r.segments.map(() => true);
  acc[r.segments.findIndex((s) => !s.same && /Bien sûr/.test(s.orig))] = false;
  assert.equal(H.assemble(r.segments, acc), 'Bien sûr ! La réponse est oui.');
});
test('Relecture : 1 000 modifications relues en moins de 1,5 s ; au-delà de 3 000, repli propre avec texte corrigé fourni', () => {
  const base = 'Le modèle est testé sur des données réelles. De plus, le point est crucial et les résultats restent partiels. ';
  let t0 = process.hrtime.bigint();
  const r = H.review(base.repeat(500));
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 1500);
  assert.ok(r.segments && r.modifications === 1000);
  const big = H.review(base.repeat(2500));
  assert.equal(big.segments, null);
  assert.ok(big.modifications > 3000 && big.text.length > 1000);
});
test('Dictionnaire : intégrité du fichier de données et mention de licence', () => {
  assert.ok(LEXDATA.verbs.reg.split(' ').length > 3000);
  assert.ok(Object.keys(LEXDATA.verbs.irr).length > 500);
  assert.ok(LEXDATA.genre.m.split(' ').length > 10000 && LEXDATA.genre.f.split(' ').length > 8000);
  const src = fs.readFileSync(path.join(__dirname, 'lexique-data.js'), 'utf8');
  assert.ok(/CC BY-SA 4\.0/.test(src) && /lexique\.org/.test(src), 'mention de licence / source manquante');
  H.setLexique(LEXDATA);
  try {
    // chaque exception stockée est bien restituée par syllables()
    for (const k of Object.keys(LEXDATA.syl)) for (const w of LEXDATA.syl[k].split(' ').slice(0, 40)) assert.equal(H.syllables(w), +k, w);
    assert.equal(H.syllables('chromatographie'), 5);   // absent du dictionnaire : règles de repli
  } finally { H.setLexique(null); }
});
test('Dictionnaire : verbes en -er reconstitués par les règles = formes de Lexique (échantillon irrégulier inclus)', () => {
  H.setLexique(LEXDATA);
  try {
    const voix = (s) => H.reformuler(s, '', '').items[0].variants.filter((v) => /^Voix/.test(v.type)).map((v) => v.text);
    assert.deepEqual(voix("L'équipe appelle les patients."), ["Les patients sont appelés par l'équipe."]);                   // appeler : doublement du « l » (exception stockée)
    assert.deepEqual(voix('Les chercheurs ont lu les articles.'), ['Les articles ont été lus par les chercheurs.']);        // lire, participe en -u
    assert.deepEqual(voix('Les médecins prennent la mesure.'), ['La mesure est prise par les médecins.']);                  // prendre, participe féminin en -ise
  } finally { H.setLexique(null); }
});
test('Voix : sans dictionnaire (état par défaut du moteur), aucune conversion active → passive', () => {
  assert.equal(H.lexiqueChargee(), false);
  assert.deepEqual(H.reformuler('Les chercheurs mesurent la concentration.', '', '').items[0].variants.filter((v) => /^Voix/.test(v.type)), []);
});
