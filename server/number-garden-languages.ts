import type { CourseDefinition } from "../shared/course.js";
import {
  translationFields,
  translationSourceHash,
} from "../shared/course-language.js";
import type { Language } from "../shared/inclusion.js";

// Original parallel counting/shape material. Numeric answer order and IDs
// remain canonical. Independent native-educator review is explicitly pending.
type Lesson = {
  title: string;
  summary: string;
  levels: [string, string];
  concepts: [string, string];
  guide: string;
  sketch: string;
  lessons: [string, string];
  drawing: string;
  shapes: [string, string, string];
  questions: [string, string, string][];
};
const variants: Partial<Record<Language, Lesson>> = {
  fr: {
    title: "Jardin des nombres",
    summary:
      "3–5 ans · Français · 10–15 minutes avec un adulte. Comptez les graines, découvrez les formes et cultivez un jardin en 3D. Les questions peuvent être lues à voix haute. Entraînement sans limite et sans chronomètre.",
    levels: ["Compter les graines", "Les formes du chemin"],
    concepts: ["Compter de petits groupes", "Reconnaître cercles et triangles"],
    guide: "guide",
    sketch: "carnet de dessin",
    lessons: [
      "Touchez ou montrez chaque graine une seule fois en comptant : 1, 2, 3. Le dernier nombre indique combien il y en a. Ne comptez pas deux fois la même graine. Comptez quelques jouets, puis dessinez vos graines. Un adulte peut lire les questions ; laissez l'enfant montrer les objets et expliquer son comptage. Exemples originaux d'Amamihe ; la référence décrit le cadre de comptage.",
      "Un cercle est rond et n'a pas de coins. Un triangle a trois côtés droits et trois coins. Le jardin a des mares rondes et des drapeaux triangulaires. Tracez un cercle dans l'air et dessinez un triangle. Chercher et dessiner des formes est un entraînement ; seule une réponse indépendante démontre la compréhension.",
    ],
    drawing:
      "Dessinez votre propre exemple et expliquez-le à une personne qui vous aide ou écrivez une phrase. Le dessin est facultatif ; la question indépendante vérifie l'apprentissage.",
    shapes: ["Triangle △", "Carré □", "Cercle ○"],
    questions: [
      [
        "Comptez ces graines : ● ● ●. Combien y en a-t-il ?",
        "Montrez chaque point une seule fois.",
        "Il y a trois graines : 1, 2, 3.",
      ],
      [
        "Une graine et encore une graine. Combien maintenant ?",
        "Levez un doigt, puis un autre.",
        "Un et un font deux graines.",
      ],
      [
        "Comptez ces fleurs : ✿ ✿ ✿ ✿. Combien y en a-t-il ?",
        "Montrez chaque fleur une fois.",
        "Il y a quatre fleurs : 1, 2, 3, 4.",
      ],
      [
        "Deux graines reçoivent une autre graine. Combien maintenant ?",
        "Commencez avec deux doigts et ajoutez-en un.",
        "Deux et un font trois graines.",
      ],
      [
        "Quelle forme est ronde et sans coins ?",
        "Pensez au bord d'une assiette ronde.",
        "Un cercle est rond et sans coins.",
      ],
      [
        "Quelle forme de drapeau a trois coins ?",
        "Comptez les coins avec votre doigt.",
        "Un triangle a trois coins et trois côtés.",
      ],
      [
        "Quelle forme correspond à une mare ronde ?",
        "Une mare peut avoir un bord rond et lisse.",
        "Une mare ronde correspond à un cercle.",
      ],
      [
        "Une forme a trois côtés droits. Qu'est-ce que c'est ?",
        "Comptez trois côtés et trois coins.",
        "Trois côtés droits forment un triangle.",
      ],
    ],
  },
  pt: {
    title: "Jardim dos números",
    summary:
      "3–5 anos · Português · 10–15 minutos com um adulto. Conte sementes, descubra formas e cultive um jardim em 3D. As perguntas podem ser lidas em voz alta. Prática ilimitada, sem limite de tempo.",
    levels: ["Contar sementes", "Formas do caminho"],
    concepts: ["Contar pequenos grupos", "Reconhecer círculos e triângulos"],
    guide: "guia",
    sketch: "caderno de desenho",
    lessons: [
      "Toque ou aponte para cada semente uma vez enquanto conta: 1, 2, 3. O último número indica quantas sementes há. Não conte a mesma semente duas vezes. Conte alguns brinquedos e desenhe as suas sementes. Um adulto pode ler as perguntas; deixe a criança apontar e explicar como contou. Os exemplos são originais de Amamihe; a referência descreve o enquadramento da contagem.",
      "Um círculo é redondo e não tem cantos. Um triângulo tem três lados retos e três cantos. O jardim tem lagos redondos e bandeiras triangulares. Trace um círculo no ar e desenhe um triângulo. Procurar e desenhar formas é prática; apenas uma resposta independente demonstra compreensão.",
    ],
    drawing:
      "Desenhe o seu próprio exemplo e explique-o a alguém que ajuda ou escreva uma frase. Desenhar é prática opcional; a pergunta independente verifica a aprendizagem.",
    shapes: ["Triângulo △", "Quadrado □", "Círculo ○"],
    questions: [
      [
        "Conte estas sementes: ● ● ●. Quantas são?",
        "Aponte para cada ponto uma vez.",
        "Há três sementes: 1, 2, 3.",
      ],
      [
        "Uma semente e mais uma semente. Quantas agora?",
        "Levante um dedo e depois outro.",
        "Um e um são duas sementes.",
      ],
      [
        "Conte estas flores: ✿ ✿ ✿ ✿. Quantas são?",
        "Aponte para cada flor uma vez.",
        "Há quatro flores: 1, 2, 3, 4.",
      ],
      [
        "Duas sementes recebem mais uma. Quantas agora?",
        "Comece com dois dedos e acrescente um.",
        "Dois e um são três sementes.",
      ],
      [
        "Que forma é redonda e não tem cantos?",
        "Pense na borda de um prato redondo.",
        "Um círculo é redondo e não tem cantos.",
      ],
      [
        "Que forma de bandeira tem três cantos?",
        "Conte os cantos com o dedo.",
        "Um triângulo tem três cantos e três lados.",
      ],
      [
        "Que forma corresponde a um lago redondo?",
        "Um lago pode ter uma borda redonda e suave.",
        "Um lago redondo corresponde a um círculo.",
      ],
      [
        "Uma forma tem três lados retos. Qual é?",
        "Conte três lados e três cantos.",
        "Três lados retos formam um triângulo.",
      ],
    ],
  },
  ar: {
    title: "حديقة الأعداد",
    summary:
      "الأعمار 3–5 · العربية · 10–15 دقيقة مع شخص بالغ. عد البذور وتعرف على الأشكال في حديقة ثلاثية الأبعاد. يمكن قراءة الأسئلة بصوت عالٍ. تدريب غير محدود دون مؤقت.",
    levels: ["عد البذور", "أشكال أحجار الطريق"],
    concepts: ["عد مجموعات صغيرة", "التعرف على الدوائر والمثلثات"],
    guide: "دليل الدراسة",
    sketch: "دفتر الرسم",
    lessons: [
      "المس أو أشر إلى كل بذرة مرة واحدة وأنت تعد: 1، 2، 3. العدد الأخير يبين عدد البذور. لا تعد البذرة نفسها مرتين. عد مجموعة صغيرة من الألعاب ثم ارسم بذورك. يمكن لشخص بالغ قراءة الأسئلة؛ دع المتعلم يشير ويشرح كيف عد. هذه أمثلة أصلية من أَماميهي؛ المرجع يشرح إطار تعلم العد.",
      "الدائرة مستديرة وليس لها زوايا. للمثلث ثلاثة أضلاع مستقيمة وثلاث زوايا. في الحديقة برك مستديرة وأعلام مثلثة. ارسم دائرة في الهواء ثم مثلثًا على الورق. البحث عن الأشكال ورسمها تدريب؛ الإجابة المستقلة وحدها تبين الفهم.",
    ],
    drawing:
      "ارسم مثالًا من عندك واشرحه لشخص يساعدك أو اكتب جملة. الرسم تدريب اختياري؛ السؤال المستقل يتحقق من التعلم.",
    shapes: ["مثلث △", "مربع □", "دائرة ○"],
    questions: [
      [
        "عد هذه البذور: ● ● ●. كم عددها؟",
        "أشر إلى كل نقطة مرة واحدة.",
        "هناك ثلاث بذور: 1، 2، 3.",
      ],
      [
        "بذرة واحدة وبذرة أخرى. كم أصبح العدد؟",
        "ارفع إصبعًا ثم إصبعًا آخر.",
        "واحد وواحد يساويان بذرتين.",
      ],
      [
        "عد هذه الأزهار: ✿ ✿ ✿ ✿. كم عددها؟",
        "أشر إلى كل زهرة مرة واحدة.",
        "هناك أربع أزهار: 1، 2، 3، 4.",
      ],
      [
        "أضف بذرة واحدة إلى بذرتين. كم أصبح العدد؟",
        "ابدأ بإصبعين ثم أضف إصبعًا.",
        "اثنان وواحد يساويان ثلاث بذور.",
      ],
      [
        "أي شكل مستدير دون زوايا؟",
        "فكر في حافة طبق مستدير.",
        "الدائرة مستديرة وليس لها زوايا.",
      ],
      [
        "أي شكل علم له ثلاث زوايا؟",
        "عد الزوايا بإصبعك.",
        "للمثلث ثلاث زوايا وثلاثة أضلاع.",
      ],
      [
        "أي شكل يشبه بركة مستديرة؟",
        "يمكن أن تكون حافة البركة ناعمة ومستديرة.",
        "البركة المستديرة تشبه الدائرة.",
      ],
      [
        "شكل له ثلاثة أضلاع مستقيمة. ما هو؟",
        "عد ثلاثة أضلاع وثلاث زوايا.",
        "ثلاثة أضلاع مستقيمة تكون مثلثًا.",
      ],
    ],
  },
  ig: {
    title: "Ogige Ọnụọgụ",
    summary:
      "Afọ 3–5 · Igbo · Nkeji 10–15 na onye toro eto. Gụọ mkpụrụ, mata ụdị, ma wuo ogige 3D. Enwere ike ịgụ ajụjụ n'olu. Omume enweghị oke ma ọ bụ oge njedebe.",
    levels: ["Ịgụ mkpụrụ", "Ụdị nkume ụzọ"],
    concepts: ["Ịgụ obere ìgwè", "Ịmata okirikiri na ụdị akụkụ atọ"],
    guide: "akwụkwọ ntuziaka",
    sketch: "akwụkwọ eserese",
    lessons: [
      "Metụ ma ọ bụ tụọ mkpụrụ ọ bụla otu ugboro ka ị na-agụ: 1, 2, 3. Ọnụọgụ ikpeazụ na-egosi ole mkpụrụ dị. Agụla otu mkpụrụ ugboro abụọ. Gụọ obere ihe egwuregwu ma see ogige mkpụrụ gị. Onye toro eto nwere ike ịgụ ajụjụ; ka onye na-amụ ihe tụọ ihe ma kọwaa otú o si gụọ. Ndị a bụ ihe atụ Amamihe dere; njikọ ahụ na-akọwa ụkpụrụ ịgụ ihe.",
      "Okirikiri dị gburugburu, ọ nweghị nkuku. Ụdị akụkụ atọ nwere akụkụ kwụ ọtọ atọ na nkuku atọ. Ogige ahụ nwere ọdọ okirikiri na ọkọlọtọ akụkụ atọ. See okirikiri n'ikuku, ma see ụdị akụkụ atọ n'akwụkwọ. Ịchọ na ise ụdị bụ omume; azịza ziri ezi n'enweghị enyemaka na-egosi nghọta.",
    ],
    drawing:
      "See ihe atụ nke gị ma kọwaara onye na-enyere gị aka, ma ọ bụ dee ahịrịokwu. Ise ihe bụ omume a pụrụ ịhọrọ; ajụjụ a zara n'enweghị enyemaka na-enyocha mmụta.",
    shapes: ["Ụdị akụkụ atọ △", "Ụdị akụkụ anọ □", "Okirikiri ○"],
    questions: [
      [
        "Gụọ mkpụrụ ndị a: ● ● ●. Ha dị ole?",
        "Tụọ ntụpọ ọ bụla otu ugboro.",
        "E nwere mkpụrụ atọ: 1, 2, 3.",
      ],
      [
        "Otu mkpụrụ na otu mkpụrụ ọzọ. Ha dị ole ugbu a?",
        "Welie otu mkpịsị aka, tinye otu ọzọ.",
        "Otu na otu bụ mkpụrụ abụọ.",
      ],
      [
        "Gụọ okooko ndị a: ✿ ✿ ✿ ✿. Ha dị ole?",
        "Tụọ ifuru ọ bụla otu ugboro.",
        "E nwere okooko anọ: 1, 2, 3, 4.",
      ],
      [
        "Mkpụrụ abụọ nwetara otu mkpụrụ ọzọ. Ha dị ole?",
        "Malite na mkpịsị aka abụọ ma tinye otu.",
        "Abụọ na otu bụ mkpụrụ atọ.",
      ],
      [
        "Kedu ụdị dị gburugburu nke na-enweghị nkuku?",
        "Chee maka ọnụ efere okirikiri.",
        "Okirikiri dị gburugburu, ọ nweghị nkuku.",
      ],
      [
        "Kedu ụdị ọkọlọtọ nwere nkuku atọ?",
        "Jiri mkpịsị aka gụọ nkuku.",
        "Ụdị akụkụ atọ nwere nkuku atọ na akụkụ atọ.",
      ],
      [
        "Kedu ụdị dabara na ọdọ okirikiri?",
        "Ọdọ nwere ike inwe ọnụ dị larịị gburugburu.",
        "Ọdọ okirikiri dabara na okirikiri.",
      ],
      [
        "Ụdị nwere akụkụ kwụ ọtọ atọ. Gịnị ka ọ bụ?",
        "Gụọ akụkụ atọ na nkuku atọ.",
        "Akụkụ kwụ ọtọ atọ na-eme ụdị akụkụ atọ.",
      ],
    ],
  },
  yo: {
    title: "Ọgbà Àwọn Nọ́mbà",
    summary:
      "Ọjọ́ orí 3–5 · Yorùbá · Ìṣẹ́jú 10–15 pẹ̀lú àgbàlagbà. Ka àwọn irúgbìn, mọ àwọn ìrísí, kí o sì kọ ọgbà 3D. A lè ka ìbéèrè sókè. Àdáṣe láìlópin, láìsí àkókò ìparí.",
    levels: ["Kíkà irúgbìn", "Ìrísí òkúta ọ̀nà"],
    concepts: ["Kíkà àwọn ẹgbẹ́ kékeré", "Mímọ ìyíká àti onígun mẹ́ta"],
    guide: "ìtọ́sọ́nà",
    sketch: "ìwé àwòrán",
    lessons: [
      "Fọwọ́ kan tàbí tọ́ka sí irúgbìn kọ̀ọ̀kan lẹ́ẹ̀kan bí o ṣe ń kà: 1, 2, 3. Nọ́mbà ìkẹyìn sọ iye irúgbìn tó wà. Má ka irúgbìn kan lẹ́ẹ̀mejì. Ka àwọn ohun ìṣeré díẹ̀, kí o sì ya irúgbìn rẹ. Àgbàlagbà lè ka ìbéèrè; jẹ́ kí akẹ́kọ̀ọ́ tọ́ka kí ó sì ṣàlàyé bí ó ṣe kà. Àpẹẹrẹ Amamihe ni wọ̀nyí; orísun náà ṣàlàyé ìlànà kíkà.",
      "Ìyíká yí ká, kò sì ní igun. Onígun mẹ́ta ní ẹ̀gbẹ́ tààrà mẹ́ta àti igun mẹ́ta. Ọgbà ní adágún yíká àti àsíá onígun mẹ́ta. Fa ìyíká sí afẹ́fẹ́, kí o sì ya onígun mẹ́ta. Wíwá àti yíya ìrísí jẹ́ àdáṣe; ìdáhùn òmìnira ló ń fi òye hàn.",
    ],
    drawing:
      "Ya àpẹẹrẹ tirẹ, ṣàlàyé fún olùrànlọ́wọ́ tàbí kọ gbólóhùn kan. Yíya jẹ́ àdáṣe tí a lè yan; ìbéèrè tí o dáhùn láìsí ìrànlọ́wọ́ ló ń ṣe àyẹ̀wò ẹ̀kọ́.",
    shapes: ["Onígun mẹ́ta △", "Onígun mẹ́rin □", "Ìyíká ○"],
    questions: [
      [
        "Ka àwọn irúgbìn wọ̀nyí: ● ● ●. Mélòó ni?",
        "Tọ́ka sí àmì kọ̀ọ̀kan lẹ́ẹ̀kan.",
        "Irúgbìn mẹ́ta wà: 1, 2, 3.",
      ],
      [
        "Irúgbìn kan àti irúgbìn kan síi. Mélòó ni báyìí?",
        "Gbérò ìka kan, kí o sì fi ìka kan kún un.",
        "Ọ̀kan àti ọ̀kan jẹ́ irúgbìn méjì.",
      ],
      [
        "Ka àwọn òdòdó wọ̀nyí: ✿ ✿ ✿ ✿. Mélòó ni?",
        "Tọ́ka sí òdòdó kọ̀ọ̀kan lẹ́ẹ̀kan.",
        "Òdòdó mẹ́rin wà: 1, 2, 3, 4.",
      ],
      [
        "Fi irúgbìn kan kún irúgbìn méjì. Mélòó ni?",
        "Bẹ̀rẹ̀ pẹ̀lú ìka méjì, kí o fi ọ̀kan kún un.",
        "Méjì àti ọ̀kan jẹ́ irúgbìn mẹ́ta.",
      ],
      [
        "Ìrísí wo ló yí ká tí kò ní igun?",
        "Rò nípa etí àwo yíká.",
        "Ìyíká yí ká, kò sì ní igun.",
      ],
      [
        "Ìrísí àsíá wo ló ní igun mẹ́ta?",
        "Ka àwọn igun pẹ̀lú ìka rẹ.",
        "Onígun mẹ́ta ní igun mẹ́ta àti ẹ̀gbẹ́ mẹ́ta.",
      ],
      [
        "Ìrísí wo ló dàbí adágún yíká?",
        "Adágún lè ní etí yíká tó rọrùn.",
        "Adágún yíká dàbí ìyíká.",
      ],
      [
        "Ìrísí kan ní ẹ̀gbẹ́ tààrà mẹ́ta. Kí ni?",
        "Ka ẹ̀gbẹ́ mẹ́ta àti igun mẹ́ta.",
        "Ẹ̀gbẹ́ tààrà mẹ́ta ṣe onígun mẹ́ta.",
      ],
    ],
  },
  ha: {
    title: "Lambun Lambobi",
    summary:
      "Shekaru 3–5 · Hausa · Minti 10–15 tare da babba. Ƙirga iri, gane siffofi, kuma gina lambun 3D. Ana iya karanta tambayoyi da murya. Atisaye marar iyaka, babu ƙayyadadden lokaci.",
    levels: ["Ƙirga iri", "Siffofin duwatsun hanya"],
    concepts: ["Ƙirga ƙananan rukuni", "Gane da'ira da mai kusurwa uku"],
    guide: "littafin jagora",
    sketch: "littafin zane",
    lessons: [
      "Taɓa ko nuna kowane iri sau ɗaya yayin ƙirgawa: 1, 2, 3. Lambar ƙarshe tana nuna yawan irin. Kada ka ƙirga iri ɗaya sau biyu. Ƙirga wasu kayan wasa ka zana irin naka. Babba zai iya karanta tambayoyi; bari ɗalibi ya nuna abubuwa ya bayyana yadda ya ƙirga. Waɗannan misalai Amamihe ne ya rubuta; tushen yana bayyana tsarin koyon ƙirgawa.",
      "Da'ira zagaye ce, ba ta da kusurwa. Mai kusurwa uku yana da gefuna madaidaici uku da kusurwa uku. Lambun yana da tafkuna zagaye da tutocin mai kusurwa uku. Zana da'ira a iska, sannan ka zana mai kusurwa uku. Nema da zana siffofi atisaye ne; amsa da aka bayar ba tare da taimako ba tana nuna fahimta.",
    ],
    drawing:
      "Zana misalin naka ka bayyana shi ga mai taimako ko ka rubuta jimla. Zane atisaye ne na zaɓi; tambayar da aka amsa ba tare da taimako ba tana tantance karatu.",
    shapes: ["Mai kusurwa uku △", "Murabba'i □", "Da'ira ○"],
    questions: [
      [
        "Ƙirga waɗannan iri: ● ● ●. Nawa ne?",
        "Nuna kowace ɗigo sau ɗaya.",
        "Akwai iri uku: 1, 2, 3.",
      ],
      [
        "Iri ɗaya da wani iri ɗaya. Nawa ne yanzu?",
        "Ɗaga yatsa ɗaya, sannan ka ƙara wani.",
        "Ɗaya da ɗaya iri biyu ne.",
      ],
      [
        "Ƙirga waɗannan furanni: ✿ ✿ ✿ ✿. Nawa ne?",
        "Nuna kowane fure sau ɗaya.",
        "Akwai furanni huɗu: 1, 2, 3, 4.",
      ],
      [
        "Ƙara iri ɗaya ga iri biyu. Nawa ne yanzu?",
        "Fara da yatsu biyu ka ƙara ɗaya.",
        "Biyu da ɗaya iri uku ne.",
      ],
      [
        "Wace siffa ce zagaye ba tare da kusurwa ba?",
        "Ka yi tunanin gefen faranti zagaye.",
        "Da'ira zagaye ce, ba ta da kusurwa.",
      ],
      [
        "Wace siffar tuta ce take da kusurwa uku?",
        "Ƙirga kusurwoyin da yatsanka.",
        "Mai kusurwa uku yana da kusurwa uku da gefuna uku.",
      ],
      [
        "Wace siffa ce ta yi daidai da tafki zagaye?",
        "Tafki na iya samun gefe mai santsi zagaye.",
        "Tafki zagaye ya yi daidai da da'ira.",
      ],
      [
        "Siffa tana da gefuna madaidaici uku. Mene ne?",
        "Ƙirga gefuna uku da kusurwa uku.",
        "Gefuna madaidaici uku suna yin mai kusurwa uku.",
      ],
    ],
  },
};
export function addNumberGardenTranslations(
  d: CourseDefinition,
): CourseDefinition {
  const questions = d.levels.flatMap((l) => [
    ...l.questions,
    ...l.retryQuestions,
  ]);
  const texts = translationFields(d);
  const translations: NonNullable<CourseDefinition["translations"]> = {};
  for (const [lang, v] of Object.entries(variants)) {
    const translated: Record<string, string | string[]> = {};
    for (const field of texts) {
      const parts = field.key.split("/");
      let value: string | string[];
      if (field.key === "title") value = v.title;
      else if (field.key === "summary") value = v.summary;
      else if (parts[0] === "concept")
        value = v.concepts[Number(parts[1].split("-").at(-1))];
      else if (parts[0] === "level")
        value = v.levels[Number(parts[1].split("-").at(-1))];
      else if (parts[0] === "resource") {
        const index = Number(parts[1].split("-").at(-1));
        value =
          parts[2] === "title"
            ? `${v.levels[index]} · ${parts[1].startsWith("journal") ? v.guide : v.sketch}`
            : parts[1].startsWith("journal")
              ? v.lessons[index]
              : v.drawing;
      } else {
        const index = questions.findIndex((q) => q.id === parts[1]);
        const [prompt, hint, explanation] = v.questions[index];
        value =
          parts[2] === "prompt"
            ? prompt
            : parts[2] === "hint"
              ? hint
              : parts[2] === "explanation"
                ? explanation
                : (field.value as string[]).map((o) =>
                    o.startsWith("Triangle")
                      ? v.shapes[0]
                      : o.startsWith("Square")
                        ? v.shapes[1]
                        : o.startsWith("Circle")
                          ? v.shapes[2]
                          : o,
                  );
      }
      translated[field.key] = value;
    }
    translations[lang as Language] = {
      sourceHash: translationSourceHash(d),
      confirmed: true,
      note: "Original authored translation with unchanged task IDs and numeric answer order. Independent native-educator review pending.",
      texts: translated,
    };
  }
  d.translations = translations;
  for (const r of d.resources)
    if (r.id.endsWith("-1"))
      r.source = "https://www.thecorestandards.org/Math/Content/K/G/";
  return d;
}
