const OpenAI = require("openai");

const { query } = require("./db");

const DEFAULT_MODEL = String(process.env.OPENAI_MODEL || "gpt-5-mini");
const MAX_QUERY_LENGTH = 400;
const MIN_RECOMMENDED_PREP_TIME_MINUTES = 2;
const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "running", "session_over"]);
const MODEL_SELECTION_SCHEMA = {
  name: "gameguru_recommendation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
      },
      best_pc_id: {
        type: "integer",
      },
      pc_reason: {
        type: "string",
      },
      alternative_pc_ids: {
        type: "array",
        items: {
          type: "integer",
        },
        maxItems: 2,
      },
      best_food_id: {
        type: "integer",
      },
      food_reason: {
        type: "string",
      },
      alternative_food_ids: {
        type: "array",
        items: {
          type: "integer",
        },
        maxItems: 2,
      },
      quick_tips: {
        type: "array",
        items: {
          type: "string",
        },
        maxItems: 3,
      },
      follow_up_question: {
        type: "string",
      },
    },
    required: [
      "summary",
      "best_pc_id",
      "pc_reason",
      "alternative_pc_ids",
      "best_food_id",
      "food_reason",
      "alternative_food_ids",
      "quick_tips",
      "follow_up_question",
    ],
  },
};

const ESPORTS_KEYWORDS = [
  "valorant",
  "valo",
  "cs",
  "cs2",
  "counter strike",
  "dota",
  "league",
  "lol",
  "apex",
  "fortnite",
  "competitive",
  "esports",
  "fps",
  "ranked",
];
const HIGH_END_KEYWORDS = [
  "cyberpunk",
  "elden ring",
  "red dead",
  "aaa",
  "ultra",
  "story",
  "4k",
  "ray tracing",
  "graphics",
  "editing",
  "render",
  "stream",
  "streaming",
  "creator",
];
const CONSOLE_KEYWORDS = [
  "console",
  "controller",
  "ps5",
  "playstation",
  "xbox",
  "ea fc",
  "fifa",
  "tekken",
  "mortal kombat",
  "wwe",
  "split screen",
  "couch",
];
const BUDGET_KEYWORDS = [
  "cheap",
  "budget",
  "affordable",
  "low cost",
  "low price",
  "save money",
];
const PREMIUM_KEYWORDS = [
  "best",
  "top",
  "ultimate",
  "premium",
  "max",
  "highest",
];
const QUICK_FOOD_KEYWORDS = ["quick", "fast", "short session", "light", "snack"];
const HEAVY_FOOD_KEYWORDS = ["meal", "heavy", "burger", "pizza", "combo", "full"];
const DRINK_KEYWORDS = ["drink", "coffee", "tea", "juice", "shake", "beverage", "energy"];
const BESTSELLER_KEYWORDS = ["bestseller", "best seller", "popular", "top food", "most ordered"];
const FOOD_DOMAIN_KEYWORDS = [
  "food",
  "menu",
  "eat",
  "snack",
  "snacks",
  "meal",
  "meals",
  "burger",
  "pizza",
  "fries",
  "sandwich",
  "drink",
  "drinks",
  "coffee",
  "tea",
  "juice",
  "shake",
  "beverage",
  "prep",
  "hungry",
];
const PC_DOMAIN_KEYWORDS = [
  "pc",
  "computer",
  "setup",
  "rig",
  "specs",
  "monitor",
  "latency",
  "performance",
  "graphics",
  "console",
];
const FAST_FOOD_KEYWORDS = [
  "lowest prep",
  "lowest prep time",
  "least prep",
  "least prep time",
  "prep time",
  "quickest",
  "fastest",
  "shortest wait",
  "ready fast",
];
const FOOD_BUDGET_KEYWORDS = [
  "cheap food",
  "budget food",
  "affordable food",
  "cheap snack",
  "budget snack",
  "cheap drink",
  "budget drink",
];
const EATABLE_KEYWORDS = [
  "food item",
  "food",
  "eat",
  "eatable",
  "meal",
  "snack",
  "snacks",
  "burger",
  "pizza",
  "sandwich",
  "fries",
];
const DRINK_CATEGORY_PATTERN = /drink|beverage|coffee|tea|shake|juice|mocktail|water|soda|cola|soft drink/i;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundCurrency(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function safeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuery(value) {
  return safeText(value).slice(0, MAX_QUERY_LENGTH);
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function categoryLabel(category) {
  switch (safeText(category).toLowerCase()) {
    case "high_end_pc":
      return "High-End PC";
    case "console":
      return "Console";
    case "esports_pc":
    default:
      return "Esports PC";
  }
}

function titleForPc(pc) {
  return `${pc.category === "console" ? "Console" : "PC"} ${pc.pc_id}`;
}

function availabilityLabel(state, status) {
  switch (safeText(state).toLowerCase()) {
    case "free":
      return "Available now";
    case "reserved":
      return "Reserved";
    case "running":
      return "In use";
    case "overtime":
      return "Running overtime";
    case "awaiting_settlement":
      return "Checkout pending";
    case "no_show_risk":
      return "Start pending";
    case "inactive":
      return "Disabled";
    default:
      return safeText(status).toLowerCase() === "inactive" ? "Disabled" : "Available";
  }
}

function derivePcState(pc) {
  const now = new Date();
  const bookingStatus = safeText(pc.booking_status).toLowerCase();

  if (safeText(pc.pc_status).toLowerCase() === "inactive") {
    return "inactive";
  }

  if (bookingStatus === "running" && pc.start_time) {
    const totalMinutes = toNumber(pc.total_slots) * 60;
    const startedAt = new Date(pc.start_time);
    const diffMinutes = Math.max(0, Math.floor((now - startedAt) / 60000));
    return diffMinutes > totalMinutes ? "overtime" : "running";
  }

  if (bookingStatus === "session_over") {
    return "awaiting_settlement";
  }

  if (bookingStatus === "confirmed") {
    const currentHour = now.getHours();
    return toNumber(pc.start_slot, -1) > currentHour ? "reserved" : "no_show_risk";
  }

  return "free";
}

function buildUserIntent(searchQuery, userContext) {
  const normalized = normalizeQuery(searchQuery).toLowerCase();
  const wantsEsports = includesAny(normalized, ESPORTS_KEYWORDS);
  const wantsHighEnd = includesAny(normalized, HIGH_END_KEYWORDS);
  const wantsConsole = includesAny(normalized, CONSOLE_KEYWORDS);
  const wantsBudget = includesAny(normalized, BUDGET_KEYWORDS);
  const wantsPremium = includesAny(normalized, PREMIUM_KEYWORDS);
  const asksFastFood = includesAny(normalized, FAST_FOOD_KEYWORDS);
  const wantsQuickFood = asksFastFood || includesAny(normalized, QUICK_FOOD_KEYWORDS);
  const wantsHeavyFood = includesAny(normalized, HEAVY_FOOD_KEYWORDS);
  const wantsDrinks = includesAny(normalized, DRINK_KEYWORDS);
  const wantsBestSellerFood = includesAny(normalized, BESTSELLER_KEYWORDS);
  const wantsFoodBudget = includesAny(normalized, FOOD_BUDGET_KEYWORDS);
  const wantsEatables = !wantsDrinks && includesAny(normalized, EATABLE_KEYWORDS);
  const mentionsFood =
    wantsQuickFood ||
    wantsHeavyFood ||
    wantsDrinks ||
    wantsEatables ||
    wantsBestSellerFood ||
    includesAny(normalized, FOOD_DOMAIN_KEYWORDS);
  const mentionsPc =
    wantsEsports ||
    wantsHighEnd ||
    wantsConsole ||
    includesAny(normalized, PC_DOMAIN_KEYWORDS);
  const queryScope =
    mentionsFood && mentionsPc ? "mixed" : mentionsFood ? "food" : mentionsPc ? "pc" : "general";

  let preferredPcCategory = null;
  let pcPreferenceSource = "general";

  if (wantsConsole) {
    preferredPcCategory = "console";
    pcPreferenceSource = "query";
  } else if (wantsHighEnd) {
    preferredPcCategory = "high_end_pc";
    pcPreferenceSource = "query";
  } else if (wantsEsports) {
    preferredPcCategory = "esports_pc";
    pcPreferenceSource = "query";
  } else if (userContext.favorite_pc_category) {
    preferredPcCategory = userContext.favorite_pc_category;
    pcPreferenceSource = "history";
  }

  let preferredFoodCategory = null;
  let foodPreferenceSource = "general";

  if (wantsDrinks) {
    preferredFoodCategory = "drinks";
    foodPreferenceSource = "query";
  } else if (wantsQuickFood) {
    preferredFoodCategory = "snacks";
    foodPreferenceSource = "query";
  } else if (wantsHeavyFood) {
    preferredFoodCategory = "meals";
    foodPreferenceSource = "query";
  } else if (userContext.favorite_food_category) {
    preferredFoodCategory = userContext.favorite_food_category;
    foodPreferenceSource = "history";
  }

  let foodGoal = "balanced";
  let foodItemType = "any";

  if (asksFastFood) {
    foodGoal = "prep_time";
  } else if (wantsBestSellerFood) {
    foodGoal = "bestseller";
  } else if (wantsDrinks) {
    foodGoal = "drinks";
  } else if (wantsHeavyFood) {
    foodGoal = "heavy";
  } else if (wantsQuickFood) {
    foodGoal = "quick";
  } else if (wantsFoodBudget) {
    foodGoal = "budget";
  }

  if (wantsDrinks) {
    foodItemType = "drink";
  } else if (mentionsFood) {
    foodItemType = "eatable";
  }

  return {
    preferred_pc_category: preferredPcCategory,
    preferred_food_category: preferredFoodCategory,
    budget_mode: wantsBudget || wantsFoodBudget ? "budget" : wantsPremium ? "premium" : "balanced",
    wants_bestseller_food: wantsBestSellerFood,
    wants_quick_food: wantsQuickFood,
    wants_drinks: wantsDrinks,
    wants_heavy_food: wantsHeavyFood,
    pc_preference_source: pcPreferenceSource,
    food_preference_source: foodPreferenceSource,
    query_scope: queryScope,
    food_goal: foodGoal,
    food_item_type: foodItemType,
    normalized_query: normalized,
  };
}

function buildPcReason(pc, signals) {
  const reasons = [];

  if (signals.preferred_pc_category && pc.category === signals.preferred_pc_category) {
    reasons.push(`fits your ${categoryLabel(pc.category).toLowerCase()} use case`);
  }

  if (pc.state === "free") {
    reasons.push("is available right now");
  } else if (pc.state === "reserved") {
    reasons.push("matches your goal even though it is reserved right now");
  }

  if (pc.recent_sessions > 0) {
    reasons.push(`has been booked ${pc.recent_sessions} times recently`);
  }

  if (signals.budget_mode === "budget") {
    reasons.push(`keeps the rate near Rs ${roundCurrency(pc.price_per_hour)}/hr`);
  } else if (signals.budget_mode === "premium") {
    reasons.push("leans toward the stronger performance tier");
  }

  return `${titleForPc(pc)} ${reasons.length ? reasons.join(", ") : "is a solid all-round pick"} .`
    .replace(" .", ".");
}

function buildFoodReason(food, signals) {
  const reasons = [];

  if (signals.food_goal === "prep_time" && food.prep_time_minutes > 0) {
    reasons.push(`has one of the quickest made-to-order prep times at about ${food.prep_time_minutes} minutes`);
  } else if (signals.wants_quick_food && food.prep_time_minutes > 0) {
    reasons.push(`usually lands in about ${food.prep_time_minutes} minutes`);
  }

  if (food.bestseller_rank === 1) {
    reasons.push("is the current bestseller");
  } else if (food.total_qty_sold > 0) {
    reasons.push(`has sold ${food.total_qty_sold} portions overall`);
  }

  if (signals.budget_mode === "budget") {
    reasons.push(`stays around Rs ${roundCurrency(food.amount)}`);
  }

  return `${food.name} ${reasons.length ? reasons.join(", ") : "is a reliable menu pick"} .`
    .replace(" .", ".");
}

function buildQuickTips(bestPc, bestFood, signals) {
  const tips = [];

  if (bestPc && bestPc.state !== "free") {
    tips.push(`If you want to start immediately, keep an eye on ${titleForPc(bestPc)} availability before checkout.`);
  }

  if (bestFood && bestFood.prep_time_minutes >= 15) {
    tips.push("Place longer-prep food a little earlier so it reaches you mid-session.");
  } else if (bestFood) {
    tips.push("Short sessions pair well with quick-serve snacks or drinks.");
  }

  if (signals.budget_mode === "budget") {
    tips.push("Picking one or two slots first keeps the total lower while you test the setup.");
  } else if (signals.budget_mode === "premium") {
    tips.push("If visuals matter most, book earlier in the day to improve your chance of landing the premium setup you want.");
  }

  return tips.slice(0, 3);
}

function buildFallbackSummary(bestPc, bestFood, signals) {
  const pcPart = bestPc
    ? `${titleForPc(bestPc)} is the best fit for ${signals.preferred_pc_category ? categoryLabel(signals.preferred_pc_category).toLowerCase() : "your current goal"}`
    : "I could not find a strong PC match right now";
  const foodPart = bestFood
    ? `${bestFood.name} is the strongest food pick${bestFood.bestseller_rank === 1 ? " and the current bestseller" : ""}`
    : "food recommendations are limited at the moment";
  return `${pcPart}, and ${foodPart}.`;
}

function buildFoodOnlySummary(bestFood, signals) {
  if (!bestFood) {
    return "I could not find a strong food match right now.";
  }

  if (signals.food_goal === "prep_time" && bestFood.prep_time_minutes > 0) {
    return `${bestFood.name} has the quickest made-to-order prep time right now at about ${bestFood.prep_time_minutes} minutes.`;
  }

  if (signals.food_goal === "bestseller" && bestFood.bestseller_rank === 1) {
    return `${bestFood.name} is the current bestseller on the menu.`;
  }

  if (signals.wants_drinks) {
    return `${bestFood.name} is the strongest drink pick right now${
      bestFood.prep_time_minutes > 0 ? ` and is usually ready in about ${bestFood.prep_time_minutes} minutes` : ""
    }.`;
  }

  if (signals.wants_heavy_food) {
    return `${bestFood.name} is the strongest full-food pick right now${
      bestFood.bestseller_rank === 1 ? " and it is also the current bestseller" : ""
    }.`;
  }

  return `${bestFood.name} is the strongest food pick right now${
    bestFood.bestseller_rank === 1 ? " and it is also the current bestseller" : ""
  }.`;
}

function buildPcOnlySummary(bestPc, signals) {
  if (!bestPc) {
    return "I could not find a strong PC match right now.";
  }

  if (signals.preferred_pc_category) {
    return `${titleForPc(bestPc)} is the best ${categoryLabel(bestPc.category).toLowerCase()} option right now.`;
  }

  if (signals.budget_mode === "budget") {
    return `${titleForPc(bestPc)} is the best value setup right now.`;
  }

  return `${titleForPc(bestPc)} is the strongest PC pick right now.`;
}

function buildScopedSummary(bestPc, bestFood, signals) {
  if (signals.query_scope === "food") {
    return buildFoodOnlySummary(bestFood, signals);
  }

  if (signals.query_scope === "pc") {
    return buildPcOnlySummary(bestPc, signals);
  }

  return buildFallbackSummary(bestPc, bestFood, signals);
}

function fallbackFollowUp(signals) {
  if (signals.budget_mode === "budget") {
    return "Want me to narrow this down to the cheapest option that still fits your game?";
  }
  if (signals.preferred_pc_category === "high_end_pc") {
    return "Want a backup pick if the high-end rigs are busy?";
  }
  return "Want me to optimize for budget, availability, or pure performance next?";
}

function buildScopedFollowUp(signals) {
  if (signals.query_scope === "food") {
    if (signals.food_goal === "prep_time") {
      return "Want the next quickest food options too?";
    }

    if (signals.wants_bestseller_food) {
      return "Want a couple of popular backups as well?";
    }

    if (signals.budget_mode === "budget") {
      return "Want the cheapest food options next?";
    }

    return "Want me to narrow this down by prep time, price, or popularity?";
  }

  if (signals.query_scope === "pc") {
    return fallbackFollowUp(signals);
  }

  return "Want me to focus more on PCs or food next?";
}

function buildScopedQuickTips(bestPc, bestFood, signals) {
  if (signals.query_scope === "food") {
    const tips = [];

    if (bestFood && signals.food_goal === "prep_time") {
      tips.push("Prep times are estimates and can stretch a little during rush hours.");
    } else if (bestFood && bestFood.prep_time_minutes >= 15) {
      tips.push("Longer-prep food is better to order a little before you want it.");
    } else if (bestFood) {
      tips.push("Quick snacks and drinks work best when you want something light between games.");
    }

    if (signals.budget_mode === "budget") {
      tips.push("Snacks and drinks usually keep the total lower than combo-style meals.");
    }

    return tips.slice(0, 3);
  }

  if (signals.query_scope === "pc") {
    const tips = [];

    if (bestPc && bestPc.state !== "free") {
      tips.push(`If you want to start immediately, keep an eye on ${titleForPc(bestPc)} availability first.`);
    }

    if (signals.budget_mode === "budget") {
      tips.push("Starting with one or two slots keeps the total lower while you test the setup.");
    } else if (signals.budget_mode === "premium") {
      tips.push("Booking a little earlier gives you a better shot at the top-tier systems.");
    }

    return tips.slice(0, 3);
  }

  return buildQuickTips(bestPc, bestFood, signals);
}

function normalizeFoodCategory(category) {
  return safeText(category).toLowerCase();
}

function hasMeaningfulPrepTime(food) {
  return toNumber(food?.prep_time_minutes) >= MIN_RECOMMENDED_PREP_TIME_MINUTES;
}

function isDrinkItem(food) {
  const text = `${safeText(food?.name)} ${safeText(food?.category)}`.trim();
  return DRINK_CATEGORY_PATTERN.test(text);
}

function matchesFoodItemType(food, signals) {
  if (signals.food_item_type === "drink") {
    return isDrinkItem(food);
  }

  if (signals.food_item_type === "eatable") {
    return !isDrinkItem(food);
  }

  return true;
}

function getFoodCandidatesForSignals(rankedFoods, signals) {
  let candidates = rankedFoods.filter((food) => matchesFoodItemType(food, signals));
  if (!candidates.length) {
    candidates = rankedFoods;
  }

  if (signals.food_goal !== "prep_time") {
    return candidates;
  }

  const madeToOrderFoods = candidates.filter((food) => hasMeaningfulPrepTime(food));
  return madeToOrderFoods.length ? madeToOrderFoods : candidates;
}

function scorePc(pc, signals, userContext, priceRange) {
  let score = 0;
  const reasons = [];

  if (pc.state === "free") {
    score += 40;
    reasons.push("available_now");
  } else if (pc.state === "reserved" || pc.state === "no_show_risk") {
    score += 15;
  } else if (pc.state === "running" || pc.state === "overtime" || pc.state === "awaiting_settlement") {
    score -= 10;
  }

  if (safeText(pc.pc_status).toLowerCase() === "inactive") {
    score -= 100;
  }

  if (signals.preferred_pc_category && pc.category === signals.preferred_pc_category) {
    score += 35;
    reasons.push("query_match");
  } else if (!signals.preferred_pc_category) {
    score += 12;
  }

  if (userContext.favorite_pc_category && pc.category === userContext.favorite_pc_category) {
    score += 10;
  }

  score += Math.min(18, pc.recent_sessions * 3);
  score += Math.min(12, Math.round(pc.total_sessions / 5));

  const minPrice = priceRange.min;
  const maxPrice = priceRange.max;
  const priceSpread = Math.max(1, maxPrice - minPrice);
  const priceScore = (maxPrice - pc.price_per_hour) / priceSpread;
  const premiumScore = (pc.price_per_hour - minPrice) / priceSpread;

  if (signals.budget_mode === "budget") {
    score += Math.round(priceScore * 20);
  } else if (signals.budget_mode === "premium") {
    score += Math.round(premiumScore * 14);
  } else {
    score += Math.round((1 - Math.abs(0.5 - premiumScore)) * 10);
  }

  return {
    ...pc,
    recommendation_score: score,
    heuristic_reason: buildPcReason(pc, signals),
    score_tags: reasons,
  };
}

function scoreFood(food, signals, userContext, priceRange) {
  let score = 0;
  const normalizedCategory = normalizeFoodCategory(food.category);
  const drinkItem = isDrinkItem(food);

  if (food.is_available) {
    score += 20;
  } else {
    score -= 20;
  }

  if (signals.food_item_type === "drink") {
    score += drinkItem ? 24 : -40;
  } else if (signals.food_item_type === "eatable") {
    score += drinkItem ? -40 : 12;
  }

  if (food.bestseller_rank === 1) {
    score += 28;
  } else {
    score += Math.max(0, 18 - food.bestseller_rank * 3);
  }

  score += Math.min(12, Math.round(food.total_qty_sold / 3));

  if (signals.preferred_food_category && normalizedCategory.includes(signals.preferred_food_category)) {
    score += 15;
  }

  if (
    userContext.favorite_food_category &&
    normalizedCategory.includes(normalizeFoodCategory(userContext.favorite_food_category))
  ) {
    score += 8;
  }

  if (signals.wants_quick_food) {
    score += Math.max(0, 15 - Math.min(15, food.prep_time_minutes || 0));
  }

  if (signals.wants_heavy_food && /meal|burger|pizza|combo|rice|pasta/.test(`${food.name} ${food.category}`.toLowerCase())) {
    score += 14;
  }

  if (signals.wants_drinks && drinkItem) {
    score += 14;
  }

  const minPrice = priceRange.min;
  const maxPrice = priceRange.max;
  const priceSpread = Math.max(1, maxPrice - minPrice);
  const priceScore = (maxPrice - food.amount) / priceSpread;
  const premiumScore = (food.amount - minPrice) / priceSpread;

  if (signals.budget_mode === "budget") {
    score += Math.round(priceScore * 16);
  } else if (signals.budget_mode === "premium") {
    score += Math.round(premiumScore * 7);
  }

  if (food.is_featured) {
    score += 6;
  }

  return {
    ...food,
    recommendation_score: score,
    heuristic_reason: buildFoodReason(food, signals),
  };
}

function compareFoodRecommendations(left, right, signals) {
  const typeMatchDiff = Number(matchesFoodItemType(right, signals)) - Number(matchesFoodItemType(left, signals));
  if (typeMatchDiff) {
    return typeMatchDiff;
  }

  const availabilityDiff = Number(right.is_available) - Number(left.is_available);
  if (availabilityDiff) {
    return availabilityDiff;
  }

  if (signals.food_goal === "prep_time") {
    const meaningfulPrepDiff = Number(hasMeaningfulPrepTime(right)) - Number(hasMeaningfulPrepTime(left));
    if (meaningfulPrepDiff) {
      return meaningfulPrepDiff;
    }

    const prepDiff = toNumber(left.prep_time_minutes) - toNumber(right.prep_time_minutes);
    if (prepDiff) {
      return prepDiff;
    }

    const priceDiff = roundCurrency(left.amount) - roundCurrency(right.amount);
    if (priceDiff) {
      return priceDiff;
    }
  }

  if (signals.food_goal === "bestseller") {
    const bestsellerDiff = toNumber(left.bestseller_rank) - toNumber(right.bestseller_rank);
    if (bestsellerDiff) {
      return bestsellerDiff;
    }
  }

  if (signals.food_goal === "budget" || (signals.query_scope === "food" && signals.budget_mode === "budget")) {
    const priceDiff = roundCurrency(left.amount) - roundCurrency(right.amount);
    if (priceDiff) {
      return priceDiff;
    }
  }

  return right.recommendation_score - left.recommendation_score || left.id - right.id;
}

function createPriceRange(items, key) {
  const values = items.map((item) => toNumber(item[key])).filter((value) => value > 0);
  if (!values.length) {
    return { min: 0, max: 1 };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function compactPcForPrompt(pc) {
  return {
    pc_id: pc.pc_id,
    title: titleForPc(pc),
    category: pc.category,
    category_label: categoryLabel(pc.category),
    specs: pc.specs,
    price_per_hour: roundCurrency(pc.price_per_hour),
    availability: availabilityLabel(pc.state, pc.pc_status),
    recent_sessions: pc.recent_sessions,
    total_sessions: pc.total_sessions,
    heuristic_reason: pc.heuristic_reason,
  };
}

function compactFoodForPrompt(food) {
  return {
    menu_id: food.id,
    name: food.name,
    category: food.category,
    amount: roundCurrency(food.amount),
    prep_time_minutes: food.prep_time_minutes,
    is_available: food.is_available,
    bestseller_rank: food.bestseller_rank,
    total_qty_sold: food.total_qty_sold,
    heuristic_reason: food.heuristic_reason,
  };
}

function serializePc(pc, reason) {
  if (!pc) {
    return null;
  }

  return {
    pc_id: pc.pc_id,
    title: titleForPc(pc),
    specs: pc.specs,
    category: pc.category,
    category_label: categoryLabel(pc.category),
    price_per_hour: roundCurrency(pc.price_per_hour),
    status: pc.pc_status,
    live_state: pc.state,
    availability_label: availabilityLabel(pc.state, pc.pc_status),
    can_reserve: safeText(pc.pc_status).toLowerCase() !== "inactive",
    total_sessions: pc.total_sessions,
    recent_sessions: pc.recent_sessions,
    reason,
  };
}

function serializeFood(food, reason) {
  if (!food) {
    return null;
  }

  return {
    menu_id: food.id,
    name: food.name,
    amount: roundCurrency(food.amount),
    image: food.image || "",
    category: food.category,
    description: food.description || "",
    prep_time_minutes: toNumber(food.prep_time_minutes),
    is_available: Boolean(food.is_available),
    is_featured: Boolean(food.is_featured),
    total_qty_sold: toNumber(food.total_qty_sold),
    total_revenue: roundCurrency(food.total_revenue),
    bestseller_rank: toNumber(food.bestseller_rank),
    reason,
  };
}

function getOpenAiClient() {
  const apiKey = safeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

async function fetchUserContext(userId) {
  const [users, favoritePcRows, favoriteFoodRows, bookingRows] = await Promise.all([
    query(
      `
        SELECT uid, name, loyalty_points
        FROM users
        WHERE uid = ?
        LIMIT 1
      `,
      [userId]
    ),
    query(
      `
        SELECT
          pc.category,
          COUNT(*) AS sessions
        FROM booking b
        JOIN pc ON pc.pc_id = b.pc_id
        WHERE b.user_id = ?
        AND b.status <> 'cancelled'
        GROUP BY pc.category
        ORDER BY sessions DESC, pc.category ASC
        LIMIT 1
      `,
      [userId]
    ),
    query(
      `
        SELECT
          COALESCE(m.category, 'Snacks') AS category,
          COALESCE(SUM(oi.qty), 0) AS total_qty
        FROM booking b
        JOIN orders o ON o.booking_id = b.booking_id
        JOIN order_items oi ON oi.order_id = o.order_id
        LEFT JOIN menu m ON m.id = oi.menu_id
        WHERE b.user_id = ?
        GROUP BY COALESCE(m.category, 'Snacks')
        ORDER BY total_qty DESC, category ASC
        LIMIT 1
      `,
      [userId]
    ),
    query(
      `
        SELECT
          COUNT(*) AS total_bookings,
          MAX(booking_date) AS last_booking_date
        FROM booking
        WHERE user_id = ?
        AND status <> 'cancelled'
      `,
      [userId]
    ),
  ]);

  const user = users[0] || {};

  return {
    user_id: Number(user.uid || userId),
    user_name: safeText(user.name) || "Player",
    loyalty_points: toNumber(user.loyalty_points),
    favorite_pc_category: safeText(favoritePcRows[0]?.category).toLowerCase() || null,
    favorite_food_category: safeText(favoriteFoodRows[0]?.category) || null,
    total_bookings: toNumber(bookingRows[0]?.total_bookings),
    last_booking_date: bookingRows[0]?.last_booking_date || null,
  };
}

async function fetchPcInventory() {
  const rows = await query(`
    SELECT
      pc.pc_id,
      pc.specs,
      pc.category,
      pc.price_per_hour,
      pc.status AS pc_status,
      active.booking_id,
      active.booking_status,
      active.start_time,
      active.user_name,
      active.start_slot,
      active.end_slot,
      active.total_slots,
      COALESCE(stats.total_sessions, 0) AS total_sessions,
      COALESCE(stats.recent_sessions, 0) AS recent_sessions
    FROM pc
    LEFT JOIN (
      SELECT
        b.pc_id,
        MAX(b.booking_id) AS booking_id,
        MAX(b.status) AS booking_status,
        MAX(b.start_time) AS start_time,
        MAX(u.name) AS user_name,
        MIN(bs.hour) AS start_slot,
        MAX(bs.hour) AS end_slot,
        COUNT(bs.hour) AS total_slots
      FROM booking b
      LEFT JOIN booking_slots bs ON bs.booking_id = b.booking_id
      LEFT JOIN users u ON u.uid = b.user_id
      WHERE b.booking_date = CURDATE()
      AND b.status IN ('confirmed', 'running', 'session_over')
      GROUP BY b.pc_id
    ) active ON active.pc_id = pc.pc_id
    LEFT JOIN (
      SELECT
        pc_id,
        COUNT(*) AS total_sessions,
        SUM(CASE WHEN booking_date >= CURDATE() - INTERVAL 30 DAY THEN 1 ELSE 0 END) AS recent_sessions
      FROM booking
      WHERE status <> 'cancelled'
      GROUP BY pc_id
    ) stats ON stats.pc_id = pc.pc_id
    ORDER BY pc.pc_id ASC
  `);

  return rows.map((row) => {
    const pc = {
      pc_id: toNumber(row.pc_id),
      specs: safeText(row.specs) || "Gaming setup",
      category: safeText(row.category).toLowerCase() || "esports_pc",
      price_per_hour: roundCurrency(row.price_per_hour),
      pc_status: safeText(row.pc_status) || "active",
      booking_id: row.booking_id ? toNumber(row.booking_id) : null,
      booking_status: safeText(row.booking_status) || null,
      start_time: row.start_time || null,
      user_name: safeText(row.user_name) || null,
      start_slot: row.start_slot === null ? null : toNumber(row.start_slot),
      end_slot: row.end_slot === null ? null : toNumber(row.end_slot),
      total_slots: toNumber(row.total_slots),
      total_sessions: toNumber(row.total_sessions),
      recent_sessions: toNumber(row.recent_sessions),
    };

    return {
      ...pc,
      state: derivePcState(pc),
    };
  });
}

async function fetchFoodInventory() {
  const rows = await query(`
    SELECT
      m.id,
      m.name,
      m.amount,
      m.image,
      m.category,
      m.description,
      m.prep_time_minutes,
      m.is_available,
      m.is_featured,
      COALESCE(SUM(oi.qty), 0) AS total_qty_sold,
      COALESCE(SUM(oi.total), 0) AS total_revenue
    FROM menu m
    LEFT JOIN order_items oi ON oi.menu_id = m.id
    LEFT JOIN orders o ON o.order_id = oi.order_id
    GROUP BY
      m.id,
      m.name,
      m.amount,
      m.image,
      m.category,
      m.description,
      m.prep_time_minutes,
      m.is_available,
      m.is_featured
    ORDER BY total_qty_sold DESC, total_revenue DESC, m.name ASC
  `);

  return rows.map((row, index) => ({
    id: toNumber(row.id),
    name: safeText(row.name) || "Menu item",
    amount: roundCurrency(row.amount),
    image: safeText(row.image),
    category: safeText(row.category) || "Snacks",
    description: safeText(row.description),
    prep_time_minutes: toNumber(row.prep_time_minutes),
    is_available: Boolean(row.is_available),
    is_featured: Boolean(row.is_featured),
    total_qty_sold: toNumber(row.total_qty_sold),
    total_revenue: roundCurrency(row.total_revenue),
    bestseller_rank: index + 1,
  }));
}

async function askOpenAiForSelection({ searchQuery, userContext, signals, pcCandidates, foodCandidates }) {
  const client = getOpenAiClient();

  if (!client) {
    return null;
  }

  const systemPrompt = [
    "You are GameGuru for a gaming cafe app.",
    "You must recommend exactly one PC and one food item from the provided candidates.",
    "Use only the supplied candidate ids and facts.",
    "Prefer currently available PCs unless every strong match is busy.",
    "Ground each reason in availability, category fit, pricing, booking popularity, prep time, and bestseller data.",
    "Do not invent specs, prices, or menu items.",
  ].join(" ");

  const userPayload = {
    user_query: searchQuery,
    user_context: userContext,
    inferred_signals: signals,
    candidate_pcs: pcCandidates.map(compactPcForPrompt),
    candidate_foods: foodCandidates.map(compactFoodForPrompt),
  };

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(userPayload),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: MODEL_SELECTION_SCHEMA,
    },
  });

  const message = completion.choices?.[0]?.message;

  if (!message || !message.content) {
    throw new Error("GameGuru returned an empty response.");
  }

  return JSON.parse(message.content);
}

function uniqueIds(values) {
  return [...new Set((values || []).map((value) => toNumber(value)).filter((value) => value > 0))];
}

async function generateGameGuruRecommendation({ userId, searchQuery }) {
  const normalizedQuery = normalizeQuery(searchQuery);

  if (!normalizedQuery) {
    const error = new Error("Tell me what you want to play or eat first.");
    error.statusCode = 400;
    throw error;
  }

  const [userContext, pcs, foods] = await Promise.all([
    fetchUserContext(userId),
    fetchPcInventory(),
    fetchFoodInventory(),
  ]);

  const signals = buildUserIntent(normalizedQuery, userContext);
  const includePc = signals.query_scope !== "food";
  const includeFood = signals.query_scope !== "pc";
  const pcPriceRange = createPriceRange(pcs, "price_per_hour");
  const foodPriceRange = createPriceRange(foods, "amount");
  const rankedPcs = pcs
    .map((pc) => scorePc(pc, signals, userContext, pcPriceRange))
    .sort((left, right) => right.recommendation_score - left.recommendation_score || left.pc_id - right.pc_id);
  const rankedFoods = foods
    .map((food) => scoreFood(food, signals, userContext, foodPriceRange))
    .sort((left, right) => compareFoodRecommendations(left, right, signals));
  const candidateFoods = getFoodCandidatesForSignals(rankedFoods, signals);

  const fallbackBestPc = rankedPcs[0] || null;
  const fallbackAltPcs = rankedPcs.slice(1, 3);
  const fallbackBestFood = candidateFoods[0] || null;
  const fallbackAltFoods = candidateFoods.slice(1, 3);

  let mode = "rules";
  let modelUsed = null;
  let summary = buildScopedSummary(fallbackBestPc, fallbackBestFood, signals);
  let quickTips = buildScopedQuickTips(fallbackBestPc, fallbackBestFood, signals);
  let followUpQuestion = buildScopedFollowUp(signals);
  let bestPc = includePc ? fallbackBestPc : null;
  let pcAlternatives = includePc ? fallbackAltPcs : [];
  let bestFood = includeFood ? fallbackBestFood : null;
  let foodAlternatives = includeFood ? fallbackAltFoods : [];
  let bestPcReason = fallbackBestPc?.heuristic_reason || "";
  let bestFoodReason = fallbackBestFood?.heuristic_reason || "";

  try {
    const shouldUseAi = signals.query_scope === "mixed" || signals.query_scope === "general";
    const aiSelection = shouldUseAi
      ? await askOpenAiForSelection({
          searchQuery: normalizedQuery,
          userContext,
          signals,
          pcCandidates: rankedPcs.slice(0, 5),
          foodCandidates: candidateFoods.slice(0, 5),
        })
      : null;

    if (aiSelection) {
      const pcById = new Map(rankedPcs.map((pc) => [pc.pc_id, pc]));
      const foodById = new Map(rankedFoods.map((food) => [food.id, food]));
      const selectedPc = pcById.get(toNumber(aiSelection.best_pc_id));
      const selectedFood = foodById.get(toNumber(aiSelection.best_food_id));

      bestPc = selectedPc || fallbackBestPc;
      bestFood = selectedFood || fallbackBestFood;

      pcAlternatives = uniqueIds(aiSelection.alternative_pc_ids)
        .map((pcId) => pcById.get(pcId))
        .filter((pc) => pc && pc.pc_id !== bestPc?.pc_id)
        .slice(0, 2);
      if (!pcAlternatives.length) {
        pcAlternatives = fallbackAltPcs.filter((pc) => pc.pc_id !== bestPc?.pc_id);
      }

      foodAlternatives = uniqueIds(aiSelection.alternative_food_ids)
        .map((foodId) => foodById.get(foodId))
        .filter((food) => food && food.id !== bestFood?.id)
        .slice(0, 2);
      if (!foodAlternatives.length) {
        foodAlternatives = fallbackAltFoods.filter((food) => food.id !== bestFood?.id);
      }

      summary = safeText(aiSelection.summary) || summary;
      quickTips = (aiSelection.quick_tips || []).map(safeText).filter(Boolean).slice(0, 3);
      if (!quickTips.length) {
        quickTips = buildQuickTips(bestPc, bestFood, signals);
      }
      followUpQuestion = safeText(aiSelection.follow_up_question) || followUpQuestion;
      bestPcReason = safeText(aiSelection.pc_reason) || bestPcReason;
      bestFoodReason = safeText(aiSelection.food_reason) || bestFoodReason;
      mode = "ai";
      modelUsed = DEFAULT_MODEL;
    }
  } catch (_) {
    mode = "rules";
  }

  return {
    query: normalizedQuery,
    generated_at: new Date().toISOString(),
    mode,
    model: modelUsed,
    user_context: {
      user_name: userContext.user_name,
      loyalty_points: userContext.loyalty_points,
      favorite_pc_category: userContext.favorite_pc_category,
      favorite_food_category: userContext.favorite_food_category,
      total_bookings: userContext.total_bookings,
      last_booking_date: userContext.last_booking_date,
    },
    signals: {
      preferred_pc_category: signals.preferred_pc_category,
      preferred_food_category: signals.preferred_food_category,
      budget_mode: signals.budget_mode,
      pc_preference_source: signals.pc_preference_source,
      food_preference_source: signals.food_preference_source,
      wants_bestseller_food: signals.wants_bestseller_food,
      query_scope: signals.query_scope,
      food_goal: signals.food_goal,
      food_item_type: signals.food_item_type,
    },
    summary,
    best_pc: serializePc(bestPc, bestPcReason),
    pc_alternatives: pcAlternatives.map((pc) => serializePc(pc, pc.heuristic_reason)),
    best_food: serializeFood(bestFood, bestFoodReason),
    food_alternatives: foodAlternatives.map((food) => serializeFood(food, food.heuristic_reason)),
    quick_tips: quickTips,
    follow_up_question: followUpQuestion,
    market_snapshot: {
      bestseller_food: serializeFood(rankedFoods[0] || null, rankedFoods[0]?.heuristic_reason || ""),
      most_booked_pc: serializePc(rankedPcs[0] || null, rankedPcs[0]?.heuristic_reason || ""),
    },
  };
}

module.exports = {
  generateGameGuruRecommendation,
};
