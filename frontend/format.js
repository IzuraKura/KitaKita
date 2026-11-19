// format.js
const MAX_UTANG_LIMIT = 10000;

function peso(value, decimals = 2) {
  const num = Number(value) || 0;
  return "₱" + num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function commas(value) {
  return (Number(value) || 0).toLocaleString("en-US");
}