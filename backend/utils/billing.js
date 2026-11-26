function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2));
}

function toValidDate(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSlotHours(slotHours = []) {
  const uniqueSlots = [...new Set((slotHours || []).map((hour) => Number(hour)).filter(Number.isInteger))];
  uniqueSlots.sort((left, right) => left - right);
  return uniqueSlots;
}

function formatDateKey(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildSlotStart(dateKey, hour) {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00`);
}

function getScheduledSessionWindow({ bookingDate, slotHours = [] }) {
  const normalizedSlotHours = normalizeSlotHours(slotHours);
  const dateKey = formatDateKey(bookingDate);

  if (!dateKey || !normalizedSlotHours.length) {
    return {
      bookingDate: dateKey,
      slotHours: normalizedSlotHours,
      startTime: null,
      endTime: null,
      durationMinutes: normalizedSlotHours.length * 60,
    };
  }

  const startTime = buildSlotStart(dateKey, normalizedSlotHours[0]);
  const endTime = buildSlotStart(
    dateKey,
    normalizedSlotHours[normalizedSlotHours.length - 1] + 1
  );

  return {
    bookingDate: dateKey,
    slotHours: normalizedSlotHours,
    startTime,
    endTime,
    durationMinutes: normalizedSlotHours.length * 60,
  };
}

function getSessionClock({
  bookingDate,
  slotHours = [],
  startTime = null,
  endTime = null,
  fallbackEndTime = new Date(),
}) {
  const window = getScheduledSessionWindow({ bookingDate, slotHours });
  const effectiveStartTime = window.startTime || toValidDate(startTime);
  let effectiveEndTime = toValidDate(endTime) || toValidDate(fallbackEndTime);

  if (!effectiveEndTime && window.endTime) {
    effectiveEndTime = new Date(window.endTime.getTime());
  } else if (!effectiveEndTime && effectiveStartTime) {
    effectiveEndTime = new Date(effectiveStartTime.getTime());
  }

  if (window.startTime && effectiveEndTime && effectiveEndTime < window.startTime) {
    effectiveEndTime = new Date(window.startTime.getTime());
  }

  if (window.endTime && effectiveEndTime && effectiveEndTime > window.endTime) {
    effectiveEndTime = new Date(window.endTime.getTime());
  }

  const minutes =
    effectiveStartTime && effectiveEndTime
      ? Math.max(0, Math.floor((effectiveEndTime - effectiveStartTime) / 60000))
      : 0;

  return {
    ...window,
    effectiveStartTime,
    effectiveEndTime,
    minutes,
  };
}

function summarizeSlotUsage({ bookingDate, slotHours = [], referenceTime = new Date() }) {
  const normalizedSlotHours = normalizeSlotHours(slotHours);
  const safeReference =
    referenceTime instanceof Date ? new Date(referenceTime.getTime()) : new Date(referenceTime);
  const dateKey = formatDateKey(bookingDate);

  if (!dateKey || !normalizedSlotHours.length || Number.isNaN(safeReference.getTime())) {
    return {
      bookingDate: dateKey,
      slotHours: normalizedSlotHours,
      billableSlotHours: [],
      futureSlotHours: normalizedSlotHours,
      totalBookedSlots: normalizedSlotHours.length,
      billableSlots: 0,
      futureSlots: normalizedSlotHours.length,
    };
  }

  const billableSlotHours = normalizedSlotHours.filter(
    (hour) => buildSlotStart(dateKey, hour) <= safeReference
  );
  const futureSlotHours = normalizedSlotHours.filter(
    (hour) => buildSlotStart(dateKey, hour) > safeReference
  );

  return {
    bookingDate: dateKey,
    slotHours: normalizedSlotHours,
    billableSlotHours,
    futureSlotHours,
    totalBookedSlots: normalizedSlotHours.length,
    billableSlots: billableSlotHours.length,
    futureSlots: futureSlotHours.length,
  };
}

function calculateBreakdown({
  minutes = 0,
  slotCount = null,
  gamingCost = null,
  pricePerHour = 0,
  foodTotal = 0,
  loyaltyPoints = 0,
  loyaltyApplied = 0,
  capturedAmount = 0,
  overrideAmount = null,
  useLoyalty = false,
  commissionRate = 0,
  convenienceFeeFlat = 0,
  convenienceFeeRate = 0,
}) {
  const safeMinutes = Math.max(0, toNumber(minutes));
  const safeSlotCount =
    slotCount === null || slotCount === undefined || slotCount === ""
      ? null
      : Math.max(0, Math.floor(toNumber(slotCount)));
  const safeRate = Math.max(0, toNumber(pricePerHour));
  const safeFoodTotal = Math.max(0, toNumber(foodTotal));
  const wallet = Math.max(0, Math.floor(toNumber(loyaltyPoints)));
  const safeCommissionRate = Math.max(0, toNumber(commissionRate));
  const safeConvenienceFeeFlat = Math.max(0, toNumber(convenienceFeeFlat));
  const safeConvenienceFeeRate = Math.max(0, toNumber(convenienceFeeRate));
  const resolvedGamingCost =
    gamingCost !== null && gamingCost !== undefined && gamingCost !== ""
      ? Math.max(0, toNumber(gamingCost))
      : safeSlotCount !== null
        ? safeSlotCount * safeRate
        : (safeMinutes / 60) * safeRate;
  let subtotal = resolvedGamingCost + safeFoodTotal;
  const safeCapturedAmount = Math.max(0, toNumber(capturedAmount));

  if (overrideAmount !== null && overrideAmount !== undefined && overrideAmount !== "") {
    subtotal = Math.max(0, toNumber(overrideAmount));
  }

  const convenienceFee =
    subtotal > 0
      ? roundCurrency(safeConvenienceFeeFlat + subtotal * (safeConvenienceFeeRate / 100))
      : 0;
  const customerSubtotal = roundCurrency(subtotal + convenienceFee);
  const safeLoyaltyApplied = Math.min(subtotal, Math.max(0, toNumber(loyaltyApplied)));
  const coveredConvenience = Math.min(convenienceFee, safeCapturedAmount);
  const coveredService = Math.max(0, safeCapturedAmount - coveredConvenience);
  const remainingServiceBalance = Math.max(0, subtotal - coveredService - safeLoyaltyApplied);
  const openBalance = Math.max(0, customerSubtotal - safeCapturedAmount - safeLoyaltyApplied);
  const loyaltyUsed = useLoyalty ? Math.min(wallet, remainingServiceBalance) : 0;
  const totalLoyaltyUsed = safeLoyaltyApplied + loyaltyUsed;
  const finalAmount = Math.max(0, subtotal - totalLoyaltyUsed);
  const customerFinalAmount = Math.max(0, finalAmount + convenienceFee);
  const amountDue = Math.max(0, customerFinalAmount - safeCapturedAmount);
  const earnedLoyalty = Math.floor(finalAmount * 0.05);
  const platformCommission = roundCurrency(finalAmount * (safeCommissionRate / 100));
  const sellerNetAmount = Math.max(0, finalAmount - platformCommission);

  return {
    minutes: safeMinutes,
    slotCount: safeSlotCount,
    gamingCost: roundCurrency(resolvedGamingCost),
    foodCost: roundCurrency(safeFoodTotal),
    subtotal: roundCurrency(subtotal),
    convenienceFee: roundCurrency(convenienceFee),
    customerSubtotal: roundCurrency(customerSubtotal),
    capturedAmount: roundCurrency(safeCapturedAmount),
    openBalance: roundCurrency(openBalance),
    remainingServiceBalance: roundCurrency(remainingServiceBalance),
    loyaltyUsed: roundCurrency(loyaltyUsed),
    totalLoyaltyUsed: roundCurrency(totalLoyaltyUsed),
    finalAmount: roundCurrency(finalAmount),
    customerFinalAmount: roundCurrency(customerFinalAmount),
    amountDue: roundCurrency(amountDue),
    earnedLoyalty,
    loyaltyPoints: wallet,
    commissionRate: roundCurrency(safeCommissionRate),
    platformCommission,
    sellerNetAmount: roundCurrency(sellerNetAmount),
  };
}

module.exports = {
  calculateBreakdown,
  getScheduledSessionWindow,
  getSessionClock,
  normalizeSlotHours,
  roundCurrency,
  summarizeSlotUsage,
  toValidDate,
  toNumber,
};
