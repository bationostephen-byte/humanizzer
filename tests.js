/* ============================================================
   Humanizzer IA Steph — suite de tests consolidée (54 tests)
   Exécutable dans le navigateur (tests.html) et sous Node.
   runTests(Humanizzer) -> [{ name, pass, details }]
   ============================================================ */
(function (root, factory) {
  const T = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.HumanizzerTests = T;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function runTests(H) {
    const results = [];
    function t(name, fn) {
      try {
        const details = fn();
        results.push({ name, pass: true, details: details || '' });
      } catch (e) {
        results.push({ name, pass: false, details: e.message });
      }
    }
    function assert(cond, msg) { if (!cond) throw new Error(msg || 'échec'); }
    function eq(a, b, msg) {
      if (a !== b) throw new Error((msg || 'valeur inattendue') + ' | obtenu : ' + JSON.stringify(a) + ' | attendu : ' + JSON.stringify(b));
    }
    const hz = (txt) => H.humanize(txt).text;

    /* ---------- PARTIE 1.1 : introductions clichés ---------- */
    t('1.1 Cliché d\'intro détecté à l\'analyse', () => {
      const a = H.analyze('Plongeons dans le monde fascinant des données.');
      const v = a.violations.find((x) => x.id === 'cliche');
      assert(v && v.count === 1, 'cliché non détecté');
    });
    t('1.1 Aucun faux cliché sur un début normal', () => {
      const a = H.analyze('Le taux de chômage a baissé de 2 points.');
      assert(!a.violations.find((x) => x.id === 'cliche'), 'faux positif');
    });

    /* ---------- PARTIE 1.2 : transitions ---------- */
    t('1.2 "De plus," remplacé par "Et"', () => {
      eq(hz('De plus, le coût augmente.'), 'Et le coût augmente.');
    });
    t('1.2 "En outre," et "Par ailleurs," remplacés', () => {
      eq(hz('En outre, la méthode échoue.'), 'Et la méthode échoue.');
      eq(hz('Par ailleurs, les délais s’allongent.'), 'Et les délais s’allongent.');
    });
    t('1.2 "Il convient de noter que" supprimé + majuscule conservée en début de phrase', () => {
      const r = hz('Le marché change. Il convient de noter que les marges restent stables.');
      eq(r, 'Le marché change. Les marges restent stables.');
    });
    t('1.2 "Force est de constater que" supprimé + majuscule conservée', () => {
      const r = hz('Force est de constater que le modèle échoue.');
      eq(r, 'Le modèle échoue.');
    });
    t('1.2 "Cela étant dit," -> "Mais"', () => {
      eq(hz('Cela étant dit, le budget manque.'), 'Mais le budget manque.');
    });
    t('1.2 "En résumé," -> "Donc,"', () => {
      eq(hz('En résumé, trois options existent.'), 'Donc, trois options existent.');
    });

    /* ---------- PARTIE 1.3 : mots interdits ---------- */
    t('1.3 adjectifs interdits remplacés (cas simple)', () => {
      eq(hz('C’est un exemple crucial.'), 'C’est un exemple décisif.');
      eq(hz('Un point essentiel du mémoire.'), 'Un point nécessaire du mémoire.');
      eq(hz('La théorie est fondamentale.'), 'La théorie est centrale.');
    });
    t('1.3 accords féminin / pluriel respectés', () => {
      eq(hz('des questions cruciales'), 'des questions décisives');
      eq(hz('des données essentielles'), 'des données nécessaires');
      eq(hz('les étapes primordiales'), 'les étapes majeures');
    });
    t('1.3 majuscule conservée', () => {
      eq(hz('Crucial : le délai.'), 'Décisif : le délai.');
    });
    t('1.3 "souligne" -> "montre" avec accords', () => {
      eq(hz('Ce chiffre souligne la tendance.'), 'Ce chiffre montre la tendance.');
      eq(hz('Ces chiffres soulignent la tendance.'), 'Ces chiffres montrent la tendance.');
    });
    t('1.3 "met en lumière" et "met en avant"', () => {
      eq(hz('L’étude met en lumière un biais.'), 'L’étude montre un biais.');
      eq(hz('Les auteurs mettent en avant trois limites.'), 'Les auteurs présentent trois limites.');
    });
    t('1.3 "au cœur de" et "en constante évolution"', () => {
      eq(hz('Le modèle au cœur de la thèse.'), 'Le modèle au centre de la thèse.');
      eq(hz('Un marché en constante évolution.'), 'Un marché en pleine mutation.');
    });
    t('1.3 "favorise" et "valorise"', () => {
      eq(hz('Ce dispositif favorise la lecture.'), 'Ce dispositif encourage la lecture.');
      eq(hz('Ce dispositif valorise le travail manuel.'), 'Ce dispositif met en valeur le travail manuel.');
    });
    t('1.3 mots interdits absents après humanisation', () => {
      const src = 'C’est crucial, essentiel et remarquable. Le paradigme optimal souligne un point incontournable.';
      const out = hz(src);
      const rest = H.analyze(out).violations.find((v) => v.id === 'banned');
      assert(!rest, 'mots interdits restants dans : ' + out);
    });

    /* ---------- PARTIE 1.4 : périphrases ---------- */
    t('1.4 "s’impose comme" -> "est"', () => {
      eq(hz('Cet outil s’impose comme une référence.'), 'Cet outil est une référence.');
    });
    t('1.4 "constitue un" -> "est un"', () => {
      eq(hz('Ce point constitue un tournant.'), 'Ce point est un tournant.');
      eq(hz('Ces données constituent des preuves.'), 'Ces données sont des preuves.');
    });
    t('1.4 "fait figure de" -> "est"', () => {
      eq(hz('Il fait figure de pionnier.'), 'Il est pionnier.');
    });

    /* ---------- PARTIE 1.5 : formules de chatbot ---------- */
    t('1.5 "J’espère que cela vous aide" supprimé', () => {
      const r = hz('Voilà pour la méthode. J’espère que cela vous aide ! Le reste suit.');
      assert(/Voilà pour la méthode\.\s*Le reste suit\./.test(r), 'obtenu : ' + r);
    });
    t('1.5 "N’hésitez pas à me dire" et "Bien sûr !" supprimés', () => {
      const r = hz('N’hésitez pas à me dire si un point reste flou.');
      assert(r.trim() === '', 'obtenu : ' + r);
      assert(!/Bien sûr/.test(hz('Bien sûr ! La réponse est oui.')), '"Bien sûr !" non supprimé');
    });

    /* ---------- PARTIE 1.6 : sources vagues ---------- */
    t('1.6 source vague signalée à l\'analyse', () => {
      const a = H.analyze('Les experts s’accordent à dire que tout va vite.');
      assert(a.violations.find((v) => v.id === 'vague'), 'non détecté');
    });

    /* ---------- PARTIE 2.1 / 2.9 : listes et gras ---------- */
    t('2.1 excès de listes calculé (max 2 par 500 mots)', () => {
      const txt = '- un\n- deux\n- trois\n- quatre\n' + 'phrase de remplissage pour atteindre le volume demandé ici. '.repeat(20);
      const a = H.analyze(txt);
      const v = a.violations.find((x) => x.id === 'lists');
      assert(v && v.excess >= 2, 'excess = ' + (v && v.excess));
    });
    t('2.9 gras excessif signalé au-delà de 15 pour 2500 mots', () => {
      const txt = ('**terme** ' + 'mot texte texte texte texte texte texte texte. ').repeat(30);
      const a = H.analyze(txt);
      assert(a.violations.find((x) => x.id === 'bold'), 'gras excessif non détecté');
    });

    /* ---------- PARTIE 2.3 : participes ---------- */
    t('2.3 participe parasite supprimé en fin de phrase', () => {
      eq(hz('WordPress équipe 43 % du web, soulignant sa domination.'), 'WordPress équipe 43 % du web.');
      eq(hz('Les ventes montent, reflétant une demande forte.'), 'Les ventes montent.');
    });
    t('2.3 participe en toute fin de texte (sans ponctuation finale)', () => {
      eq(hz('Le réseau grandit, contribuant à la diffusion'), 'Le réseau grandit');
    });

    /* ---------- PARTIE 2.5 : pas seulement X, aussi Y ---------- */
    t('2.5 tournure "pas seulement… aussi" détectée', () => {
      const a = H.analyze('C’est pas seulement rapide, mais aussi fiable.');
      assert(a.violations.find((v) => v.id === 'ps'), 'non détecté');
    });

    /* ---------- PARTIE 2.6 : tirets cadratins ---------- */
    t('2.6 paire de tirets -> parenthèses', () => {
      eq(hz('Le modèle — le seul testé — échoue ici.'), 'Le modèle (le seul testé) échoue ici.');
    });
    t('2.6 tiret isolé -> virgule', () => {
      eq(hz('App : rédaction — mieux que rien, mais fragile.'), 'App : rédaction, mieux que rien, mais fragile.');
    });
    t('2.6 plus aucun tiret cadratin après humanisation', () => {
      const out = hz('Un cas — simple, un autre — double — cas.');
      assert(!/[—–]/.test(out), 'tiret restant : ' + out);
    });

    /* ---------- PARTIE 2.7 : flèches ---------- */
    t('2.7 flèche inline -> " : "', () => {
      eq(hz('le plan -> trois axes'), 'le plan : trois axes');
    });
    t('2.7 flèche en début de ligne supprimée', () => {
      const out = hz('Les axes :\n-> vitesse\n-> coût');
      assert(!/->/.test(out), 'flèche restante : ' + out);
    });

    /* ---------- PARTIE 2.8 : phrases courtes en série ---------- */
    t('2.8 série de phrases très courtes détectée', () => {
      const txt = 'Cela marche. C’est simple. C’est rapide. C’est fiable. C’est propre. Le résultat global reste néanmoins très solide sur la durée du test complet.';
      const a = H.analyze(txt);
      assert(a.violations.find((v) => v.id === 'series'), 'série non détectée');
    });

    /* ---------- PARTIE 2.10 : registre académique ---------- */
    t('2.10 "Afin de" -> "Pour" et "En ce qui concerne" -> "Pour"', () => {
      eq(hz('Afin de mesurer, on teste.'), 'Pour mesurer, on teste.');
      eq(hz('En ce qui concerne les délais, rien ne bouge.'), 'Pour les délais, rien ne bouge.');
    });
    t('2.10 "Dans le cadre de ce" -> "Dans ce"', () => {
      eq(hz('Dans le cadre de ce mémoire, nous testons.'), 'Dans ce mémoire, nous testons.');
    });

    /* ---------- pipeline ---------- */
    t('Pipeline : transformation complète d\'un texte « à la machine »', () => {
      const src = 'Plongeons dans le sujet. Ce point est crucial. De plus, le réseau — le plus large — grandit, soulignant une domination. En outre, le modèle s’impose comme une référence. J’espère que cela vous aide !';
      const out = H.humanize(src);
      assert(!/[—–]|De plus|En outre|crucial|s’impose comme|J’espère/.test(out.text), 'résidus : ' + out.text);
      assert(out.after.score >= out.before.score, 'score après (' + out.after.score + ') < avant (' + out.before.score + ')');
    });
    t('Pipeline : idempotence (2e passage sans modification)', () => {
      const src = 'Ce point est crucial. De plus, le réseau grandit, soulignant une domination. Un cas — simple. Bien sûr !';
      const first = H.humanize(src);
      const second = H.humanize(first.text);
      eq(second.log.length, 0, 'le 2e passage a encore modifié : ' + JSON.stringify(second.log.slice(0, 3)) + ' | texte : ' + first.text);
    });
    t('Pipeline : le score de conformité augmente', () => {
      const src = 'Il convient de noter que Ce sujet est essentiel. Par ailleurs, les données sont indisponibles, témoignant d’un défaut.';
      const r = H.humanize(src);
      assert(r.after.score > r.before.score, 'score ' + r.before.score + ' -> ' + r.after.score);
    });

    /* ---------- compétence reformuler ---------- */
    t('Reformuler : dédoublement d\'une longue phrase', () => {
      const r = H.reformuler('L’étude couvre quinze années de données hospitalières, mais les résultats restent partiels sur les enfants.', 'Dupont (2020)', 'données hospitalières');
      const v = r.items[0].variants.find((x) => x.type.indexOf('Dédoublement') !== -1);
      assert(v && v.text.indexOf('.') !== -1 && v.text.split(/[.!?]/).filter((s) => s.trim()).length >= 2, 'variante absente : ' + JSON.stringify(r.items[0].variants.map((x) => x.type)));
    });
    t('Reformuler : « Il y a X qui Y » -> « X Y »', () => {
      const r = H.reformuler('Il y a des chercheurs qui contestent ce chiffre.', 'Martin (2019)', '');
      const v = r.items[0].variants.find((x) => x.text.indexOf('Des chercheurs contestent') !== -1);
      assert(v, 'variante non générée');
    });
    t('Reformuler : tournure impersonnelle -> « On peut »', () => {
      const r = H.reformuler('Il est possible de mesurer ce biais.', 'Rio (2021)', '');
      const v = r.items[0].variants.find((x) => x.text.indexOf('On peut mesurer') !== -1);
      assert(v, 'variante non générée');
    });
    t('Reformuler : fusion de deux phrases courtes', () => {
      const r = H.reformuler('Le modèle est simple. Il reste fragile.', 'Leer (2018)', '');
      const v = r.items[0].variants.find((x) => x.type.indexOf('Fusion') !== -1);
      assert(v && /simple, il reste fragile\./.test(v.text), 'fusion : ' + JSON.stringify(r.items[0].variants));
    });
    t('Reformuler : chiffres et unités préservés dans chaque variante', () => {
      const s = 'La température monte de 2,5 °C, mais les rendements baissent de 12 % sur la période étudiée par l’équipe.';
      const r = H.reformuler(s, 'Insee (2023)', 'rendements');
      assert(r.must.indexOf('2,5 °C') !== -1 && r.must.indexOf('12 %') !== -1, 'tokens : ' + JSON.stringify(r.must));
      for (const it of r.items) for (const v of it.variants) {
        assert(v.text.indexOf('2,5 °C') !== -1 && v.text.indexOf('12 %') !== -1, 'chiffre perdu : ' + v.text);
      }
    });
    t('Reformuler : variante altérant le contenu marquée non conforme', () => {
      const s = 'Le rendement atteint 43 % en 2024, mais il chute ensuite.';
      const r = H.reformuler(s, 'Istat (2025)', '');
      for (const it of r.items) for (const v of it.variants) {
        if (v.text.indexOf('43 %') === -1) assert(v.ok === false, 'variante sans chiffre marquée conforme');
      }
    });
    t('Reformuler : alerte si aucune source indiquée', () => {
      const r = H.reformuler('Une phrase simple.', '', '');
      assert(r.warns.some((w) => w.indexOf('Aucune source') !== -1), 'alerte absente');
    });
    t('Reformuler : alerte citation sans référence', () => {
      const r = H.reformuler('Selon l’auteur, « la mesure reste approximative dans ce cadre ».', '', '');
      assert(r.warns.some((w) => w.indexOf('guillemets') !== -1), 'alerte absente');
    });
    t('patchCheck : copie quasi identique -> risque élevé', () => {
      const src = 'La croissance du commerce en ligne a modifié les habitudes d’achat des ménages urbains.';
      const r = H.patchCheck(src, 'La croissance du commerce en ligne a changé les habitudes d’achat des ménages urbains.');
      assert(r.distance > 0.6 && r.verdict.indexOf('élevé') !== -1, 'distance = ' + r.distance);
    });
    t('patchCheck : reformulation profonde -> bonne distance', () => {
      const src = 'La croissance du commerce en ligne a modifié les habitudes d’achat des ménages urbains.';
      const r = H.patchCheck(src, 'Les citadins achètent autrement depuis que la vente par internet se développe.');
      assert(r.distance < 0.4, 'distance = ' + r.distance);
    });

    /* ---------- analyse : métriques ---------- */
    t('Analyse : métriques de longueur cohérentes', () => {
      const a = H.analyze('Phrase numéro une avec plusieurs mots. Courte. Une autre phrase un peu plus longue que la précédente.');
      assert(a.sentences === 3, 'sentences = ' + a.sentences);
      assert(a.maxLen >= a.avgLen && a.avgLen >= a.minLen, 'incohérence min/moy/max');
    });
    t('Analyse : score faible pour un texte « à la machine », élevé après correction', () => {
      const bad = 'Plongeons dans ce sujet crucial. De plus, il convient de noter que Les données manquent. En résumé, le paradigme optimal — le seul viable — favorise la croissance, soulignant une tendance.';
      const good = H.humanize(bad).text;
      const a1 = H.analyze(bad), a2 = H.analyze(good);
      assert(a2.score > a1.score, a1.score + ' -> ' + a2.score + ' | ' + good);
    });

    /* ---------- NOUVEAUX TESTS DE CONSOLIDATION ---------- */
    t('2.3 Participe en incise supprimé sans détruire la fin de la phrase', () => {
      const r = hz('Ce protocole, illustrant la méthode, donne un rendement stable.');
      eq(r, 'Ce protocole donne un rendement stable.');
    });
    t('1.4 & 2.10 Périphrases et registre lourd corrigés aussi en milieu et début de phrase', () => {
      eq(hz('Constitue un biais majeur.'), 'Est un biais majeur.');
      eq(hz('On filtre afin de réduire le bruit.'), 'On filtre pour réduire le bruit.');
      eq(hz('Ce témoin sert de le modèle.'), 'Ce témoin est le modèle.');
    });
    t('Reformuler : chiffres répartis sur plusieurs phrases ne créent pas de faux "contenu altéré"', () => {
      const txt = 'La température augmente de 2,5 °C, mais la pression baisse. Il est possible de réduire les pertes de 15 %.';
      const r = H.reformuler(txt, 'Dupont (2024)', '');
      assert(r.items[0].variants.length > 0 && r.items[0].variants[0].ok === true, 'Faux positif sur la phrase 1');
      assert(r.items[1].variants.length > 0 && r.items[1].variants[0].ok === true, 'Faux positif sur la phrase 2');
    });
    t('Analyse : les abréviations académiques (p., et al., fig.) ne faussent pas le comptage de phrases', () => {
      const txt = 'Selon Martin et al. (2022, p. 14), le composé inhibe l’enzyme (cf. fig. 2).';
      const a = H.analyze(txt);
      eq(a.sentences, 1, 'Découpage abusif sur abréviation : ' + a.sentences + ' phrases détectées');
    });

    return results;
  }

  return { runTests };
});
