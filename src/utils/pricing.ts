/**
 * Calculates new weighted average purchase price when new stock is purchased.
 * Formula:
 * New Avg Price = ((Existing Quantity * Existing Avg Price) + (New Quantity * New Purchase Price)) / (Existing Quantity + New Quantity)
 *
 * If existing quantity <= 0 (e.g. out of stock), the new avg purchase price is simply the new purchase price.
 */
export function calculateWeightedAveragePrice(
  currentQuantity: number,
  currentAvgPrice: number,
  addedQuantity: number,
  newPurchasePrice: number
): number {
  if (addedQuantity <= 0) return currentAvgPrice;

  const validCurrentQty = Math.max(0, currentQuantity);
  const totalQuantity = validCurrentQty + addedQuantity;

  if (totalQuantity === 0) return newPurchasePrice;

  const currentTotalValue = validCurrentQty * currentAvgPrice;
  const addedTotalValue = addedQuantity * newPurchasePrice;

  const newAvgPrice = (currentTotalValue + addedTotalValue) / totalQuantity;
  return Number(newAvgPrice.toFixed(2));
}

/**
 * Checks if an item or variant is below its stock threshold.
 */
export function isLowStock(quantity: number, threshold: number): boolean {
  return quantity <= threshold;
}

/**
 * Formats a currency amount into standard Indian Rupee format (e.g. ₹ 1,23,456.00)
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Formats quantity display according to unit type
 */
export function formatQuantity(quantity: number, unitType: string): string {
  if (unitType === 'weight') {
    return `${quantity.toFixed(quantity % 1 === 0 ? 0 : 2)} kg`;
  }
  return `${quantity} pcs`;
}
