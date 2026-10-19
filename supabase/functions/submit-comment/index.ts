import { createClient } from "npm:@supabase/supabase-js@2";
import { requestIdentity, consumeBudget, readJsonBody, ClientRequestError } from "../_shared/request-security.js";
/* =========================================================
   CORS
========================================================= */ const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
/* =========================================================
   PROFANITY WORDS
========================================================= */ const profanityWords = [
  /* Indonesia, Sunda, regional, vulgar, dan English */ "anjing",
  "bangsat",
  "bajingan",
  "kontol",
  "memek",
  "ngentot",
  "goblok",
  "tolol",
  "kampret",
  "brengsek",
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "asshole",
  "motherfucker",
  "kanjut",
  "goreng",
  "kampung",
  "judol",
  "depo",
  "link",
  "anjir",
  "anjirr",
  "anjrit",
  "anjay",
  "anjayy",
  "anjingg",
  "anjink",
  "anying",
  "anyingg",
  "anyink",
  "asu",
  "asuu",
  "bangsatt",
  "bangsad",
  "bangshat",
  "bajingann",
  "bajing",
  "kamprett",
  "keparat",
  "keparatt",
  "bedebah",
  "brengsekk",
  "sialan",
  "sialann",
  "laknat",
  "biadab",
  "kurang ajar",
  "kurangajar",
  "setan",
  "setann",
  "iblis",
  "goblog",
  "goblo",
  "gblk",
  "goblook",
  "goblokk",
  "tololl",
  "tll",
  "bego",
  "begok",
  "begoo",
  "bloon",
  "oon",
  "dongo",
  "dongok",
  "dungu",
  "bodoh",
  "idiot",
  "idiott",
  "otak udang",
  "otakudang",
  "otak kosong",
  "otakkosong",
  "bacot",
  "bacott",
  "bacottt",
  "bacod",
  "bacoddd",
  "cupu",
  "cemen",
  "najis",
  "najiss",
  "tai",
  "taik",
  "taiii",
  "tahi",
  "tahii",
  "telek",
  "monyet",
  "monyett",
  "kunyuk",
  "kampungan",
  "sampah",
  "sampahh",
  "pecundang",
  "sia",
  "siah",
  "belegug",
  "belegugna",
  "kehed",
  "kehed teh",
  "koplok",
  "koplok maneh",
  "jurig",
  "jurig sia",
  "modar",
  "modar sia",
  "paeh",
  "paeh sia",
  "bagong",
  "bagong sia",
  "bedegong",
  "boloho",
  "boloho pisan",
  "beungeut sia",
  "beungeut",
  "anying sia",
  "kontoll",
  "kontolll",
  "kntl",
  "k0ntol",
  "k0nt0l",
  "konthol",
  "kontl",
  "kancut",
  "memekk",
  "memekkk",
  "mmk",
  "m3m3k",
  "meki",
  "mekii",
  "pepek",
  "pepekk",
  "puki",
  "pukimak",
  "pukima",
  "pukimay",
  "pukimak kau",
  "pantek",
  "pantekk",
  "pantek kau",
  "pentil",
  "tetek",
  "tete",
  "toket",
  "tokett",
  "tokedd",
  "titit",
  "titid",
  "penis",
  "vagina",
  "jembut",
  "jembutt",
  "jmbt",
  "jembot",
  "tempik",
  "tempikk",
  "ngentott",
  "ngentod",
  "ngentoddd",
  "ngntot",
  "ngntod",
  "ngewe",
  "ngewee",
  "ngeweee",
  "ewe",
  "ewean",
  "entot",
  "entod",
  "coli",
  "colmek",
  "colay",
  "masturbasi",
  "sange",
  "sangean",
  "sangeee",
  "horny",
  "fucker",
  "fck",
  "fcking",
  "fucc",
  "fuk",
  "fuking",
  "shitt",
  "bullshit",
  "bitches",
  "bitchh",
  "bastard",
  "dick",
  "dickhead",
  "motherfucking",
  "wtf"
];
/* =========================================================
   SPAM KEYWORDS
========================================================= */ const spamKeywords = [
  /* Spam, judi online, judol, slot, togel, casino, dan betting */ "casino",
  "judol",
  "judi online",
  "slot gacor",
  "deposit sekarang",
  "bonus deposit",
  "free money",
  "get rich quick",
  "click here",
  "klik link",
  "promo terbatas",
  "judi slot",
  "judi bola",
  "judi togel",
  "judi poker",
  "situs judi",
  "web judi",
  "website judi",
  "link judi",
  "link judol",
  "bandar judi",
  "agen judi",
  "casino online",
  "kasino online",
  "slot online",
  "slot maxwin",
  "slot gacor hari ini",
  "slot gacor maxwin",
  "slot resmi",
  "slot terpercaya",
  "slot terbaik",
  "slot terbaru",
  "slot mudah menang",
  "slot pasti menang",
  "slot anti rungkad",
  "slot anti rungkat",
  "game slot",
  "mesin slot",
  "maxwin",
  "max win",
  "maxxwin",
  "maxwinn",
  "maxwinnn",
  "gacor parah",
  "gacor banget",
  "gacor hari ini",
  "gacor malam ini",
  "gacor pagi ini",
  "gacor siang ini",
  "gacor terus",
  "gacor pol",
  "pasti gacor",
  "auto gacor",
  "auto maxwin",
  "auto max win",
  "anti rungkad",
  "anti rungkat",
  "anti boncos",
  "anti kalah",
  "pasti menang",
  "mudah menang",
  "menang terus",
  "cuan terus",
  "cuan besar",
  "depo slot",
  "depo judol",
  "depo judi",
  "deposit judi",
  "deposit slot",
  "deposit murah",
  "deposit receh",
  "depo receh",
  "depo murah",
  "depo 5k",
  "depo5k",
  "depo 10k",
  "depo10k",
  "depo 20k",
  "depo20k",
  "depo 25k",
  "depo25k",
  "depo 50k",
  "depo50k",
  "deposit 5k",
  "deposit5k",
  "deposit 10k",
  "deposit10k",
  "withdraw slot",
  "wd slot",
  "wdslot",
  "wd gacor",
  "wd besar",
  "wd terus",
  "wd cepat",
  "auto wd",
  "langsung wd",
  "rtp slot",
  "rtpslot",
  "rtp live",
  "rtplive",
  "rtp gacor",
  "rtp tertinggi",
  "rtp hari ini",
  "rtp slot hari ini",
  "rtp live slot",
  "live rtp",
  "live rtp slot",
  "pola slot",
  "polaslot",
  "pola gacor",
  "pola maxwin",
  "pola max win",
  "pola gacor hari ini",
  "bocoran slot",
  "bocoran gacor",
  "bocoran rtp",
  "jam gacor",
  "jam hoki",
  "jam hoki slot",
  "scatter",
  "scatter hitam",
  "scatter merah",
  "scatter maxwin",
  "scatter gacor",
  "scatter mudah",
  "scatter gampang",
  "free spin slot",
  "freespin slot",
  "free spin gacor",
  "buy spin",
  "buyspin",
  "buy spin murah",
  "buyspin murah",
  "buy feature",
  "buyfeature",
  "jackpot slot",
  "jackpotslot",
  "jackpot besar",
  "jackpot gacor",
  "mega jackpot",
  "super jackpot",
  "togel online",
  "togel terpercaya",
  "togel resmi",
  "bandar togel",
  "agen togel",
  "prediksi togel",
  "angka togel",
  "angka hoki",
  "angka jitu",
  "nomor togel",
  "nomor jitu",
  "nomor hoki",
  "bocoran togel",
  "bocoran angka",
  "bocoran angka togel",
  "rumus togel",
  "syair togel",
  "kode alam",
  "erek erek",
  "erek-erek",
  "2d togel",
  "3d togel",
  "4d togel",
  "togel 2d",
  "togel 3d",
  "togel 4d",
  "daftar judi",
  "daftar slot",
  "daftar judol",
  "main slot",
  "main judi",
  "main judol",
  "main togel",
  "login slot",
  "login judi",
  "login judol",
  "register slot",
  "register judi",
  "register judol",
  "join slot",
  "join judi",
  "join judol",
  "gabung slot",
  "gabung judol",
  "klik link judi",
  "klik link slot",
  "klik link bio",
  "link di bio",
  "link slot",
  "link alternatif",
  "link alternatif slot",
  "link alternatif judi",
  "link alternatif judol",
  "link gacor",
  "link maxwin",
  "situs slot",
  "situs slot gacor",
  "situs gacor",
  "situs maxwin",
  "situs togel",
  "bonus slot",
  "bonus judi",
  "bonus judol",
  "bonus depo",
  "bonus member baru",
  "bonus new member",
  "bonus member",
  "bonus referral",
  "bonus referal",
  "bonus harian",
  "bonus mingguan",
  "bonus cashback",
  "cashback slot",
  "cashback judi",
  "promo slot",
  "promo judi",
  "promo judol",
  "promo deposit",
  "promo depo",
  "freebet",
  "free bet",
  "betting online",
  "online betting",
  "sportsbook",
  "sports betting",
  "taruhan bola",
  "taruhan online",
  "pasang taruhan",
  "pasang bola",
  "bet bola",
  "betbola",
  "parlay",
  "parlay bola",
  "judi parlay",
  "mix parlay",
  "mixparlay",
  "live casino",
  "livecasino",
  "roulette online",
  "blackjack online",
  "baccarat online",
  "poker online",
  "pokeronline",
  "bandar poker",
  "wa admin slot",
  "wa admin judi",
  "wa admin judol",
  "whatsapp admin slot",
  "whatsapp judi",
  "whatsapp slot",
  "telegram slot",
  "telegram judi",
  "telegram judol",
  "grup slot",
  "grup judol",
  "group slot",
  "group judi",
  "admin slot",
  "admin judol",
  "admin judi",
  "hubungi admin slot",
  "chat admin slot",
  "langsung daftar",
  "daftar sekarang"
];
/* =========================================================
   JSON RESPONSE HELPER
========================================================= */ function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "600" } : {})
    }
  });
}
/* =========================================================
   NORMALIZE TEXT

   Contoh:
   G0BL0K
   → goblok

   F*U*C*K
   → fuck
========================================================= */ function normalizeText(text) {
  return text.normalize("NFKD").toLowerCase()/* leetspeak */ .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b")/* simbol jadi spasi */ .replace(/[^a-z0-9\s]/g, " ")/* rapikan spasi */ .replace(/\s+/g, " ").trim();
}
/* =========================================================
   FLEXIBLE TERM MATCHING

   Mendukung:
   anjing
   A N J I N G
   a.n.j.i.n.g
   k0nt0l
   judi online
   judionline
========================================================= */ function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function createFlexibleTermPattern(term) {
  const compactTerm = normalizeText(term).replace(/\s+/g, "");
  const flexibleCharacters = compactTerm.split("").map((character)=>escapeRegExp(character)).join("\\s*");
  return new RegExp(`(?:^|\\s)${flexibleCharacters}(?=\\s|$)`, "i");
}
/* Pre-compile pattern agar tidak dibuat ulang setiap request */ const profanityPatterns = profanityWords.map(createFlexibleTermPattern);
const spamKeywordPatterns = spamKeywords.map(createFlexibleTermPattern);
/* =========================================================
   CHECK PROFANITY
========================================================= */ function containsProfanity(text) {
  const normalized = normalizeText(text);
  return profanityPatterns.some((pattern)=>pattern.test(normalized));
}
/* =========================================================
   SPAM SCORE
========================================================= */ function calculateSpamScore(originalMessage) {
  let score = 0;
  const normalized = normalizeText(originalMessage);
  /* =====================================================
       LINKS
    ===================================================== */ const links = originalMessage.match(/(https?:\/\/|www\.)/gi);
  const linkCount = links ? links.length : 0;
  if (linkCount === 1) {
    score += 1;
  }
  if (linkCount >= 2) {
    score += 3;
  }
  /* =====================================================
       SPAM KEYWORDS
    ===================================================== */ let keywordMatches = 0;
  spamKeywordPatterns.forEach((pattern)=>{
    if (pattern.test(normalized)) {
      keywordMatches++;
    }
  });
  if (keywordMatches === 1) {
    score += 1;
  }
  if (keywordMatches >= 2) {
    score += 3;
  }
  /* =====================================================
       REPEATED CHARACTERS
    ===================================================== */ if (/(.)\1{7,}/i.test(originalMessage)) {
    score += 2;
  }
  /* =====================================================
       REPEATED WORDS
    ===================================================== */ if (/\b(\w+)(?:\s+\1){3,}\b/i.test(normalized)) {
    score += 2;
  }
  /* =====================================================
       TOO MANY SYMBOLS
    ===================================================== */ const symbols = originalMessage.match(/[!$#%^&*+=<>]/g);
  if (symbols && symbols.length >= 8) {
    score += 1;
  }
  /* =====================================================
       ALL CAPS
    ===================================================== */ const letters = originalMessage.match(/[a-zA-Z]/g);
  const upperLetters = originalMessage.match(/[A-Z]/g);
  if (letters && upperLetters && letters.length >= 12) {
    const uppercaseRatio = upperLetters.length / letters.length;
    if (uppercaseRatio >= 0.8) {
      score += 1;
    }
  }
  return score;
}
/* =========================================================
   MAIN FUNCTION
========================================================= */ Deno.serve(async (req)=>{
  /* =====================================================
       CORS PREFLIGHT
    ===================================================== */ if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  /* =====================================================
       ONLY POST
    ===================================================== */ if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      message: "Method tidak diizinkan."
    }, 405);
  }
  try {
    /* =================================================
           READ BODY
        ================================================= */ const body = await readJsonBody(req);
    if (typeof body.name !== "string" || typeof body.message !== "string") {
      throw new ClientRequestError(400);
    }
    const name = String(body.name ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
    const message = String(body.message ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
    /* =================================================
           BASIC VALIDATION
        ================================================= */ if (name.length < 2 || name.length > 30) {
      return jsonResponse({
        success: false,
        message: "Nama harus 2 sampai 30 karakter."
      }, 400);
    }
    if (message.length < 3 || message.length > 500) {
      return jsonResponse({
        success: false,
        message: "Pesan harus 3 sampai 500 karakter."
      }, 400);
    }
    /* =================================================
           SUPABASE SERVER CLIENT
        ================================================= */ const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const rateLimitPepper = Deno.env.get("RATE_LIMIT_PEPPER");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variable tidak tersedia.");
    }
    if (!rateLimitPepper) {
      throw new Error("RATE_LIMIT_PEPPER belum dibuat.");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const visitorHash = await requestIdentity(req, name => Deno.env.get(name));
    if (!await consumeBudget(supabase, "guestbook", visitorHash)) {
      return jsonResponse({ success: false, status: "rate_limited",
        message: "Terlalu banyak mengirim pesan. Silakan coba lagi dalam beberapa menit." }, 429);
    }
    /* =================================================
           MODERATION
        ================================================= */ const hasProfanity = containsProfanity(`${name} ${message}`);
    let spamScore = calculateSpamScore(message);
    let commentStatus = "approved";
    /* =================================================
           PROFANITY
        ================================================= */ if (hasProfanity) {
      spamScore = Math.max(spamScore, 5);
      commentStatus = "blocked";
    } else if (spamScore >= 4) {
      commentStatus = "blocked";
    } else if (spamScore >= 2) {
      commentStatus = "pending";
    } else {
      commentStatus = "approved";
    }
    /* =================================================
           INSERT COMMENT
        ================================================= */ const { data, error } = await supabase.from("comments").insert({
      name: name,
      message: message,
      status: commentStatus,
      spam_score: spamScore,
      report_count: 0
    }).select("id, status, spam_score, created_at").single();
    if (error) {
      console.error("Database error:", error);
      throw new Error("Komentar gagal disimpan.");
    }
    /* =================================================
           BLOCKED
        ================================================= */ if (commentStatus === "blocked") {
      return jsonResponse({
        success: false,
        status: "blocked",
        message: "Pesan tidak dapat dikirim karena terdeteksi sebagai spam atau mengandung kata yang tidak diperbolehkan."
      }, 422);
    }
    /* =================================================
           PENDING
        ================================================= */ if (commentStatus === "pending") {
      return jsonResponse({
        success: true,
        status: "pending",
        message: "Pesan berhasil diterima dan sedang diperiksa.",
        comment: data
      }, 201);
    }
    /* =================================================
           APPROVED
        ================================================= */ return jsonResponse({
      success: true,
      status: "approved",
      message: "Pesan berhasil dikirim.",
      comment: data
    }, 201);
  } catch (error) {
    if (error instanceof ClientRequestError) {
      return jsonResponse({ success: false, message: "Permintaan tidak valid." }, error.status);
    }
    console.error("submit-comment failed");
    return jsonResponse({
      success: false,
      message: "Terjadi kesalahan pada server."
    }, 500);
  }
});
