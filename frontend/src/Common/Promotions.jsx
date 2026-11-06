import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "./api";
import { formatAmount } from "./promotionFormatting";
import "./Promotions.css";

const PromotionsContext = createContext({});

export function PromotionsProvider({ enabled = true, children }) {
  const [promotions, setPromotions] = useState({});
  const { pathname } = useLocation();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const result = await api("/promotions", { signal: controller.signal });
        if (!controller.signal.aborted) setPromotions(Object.fromEntries(result.promotions.map((promotion) => [promotion.targetId, promotion])));
      } catch { /* Travel content remains available when the API is temporarily offline. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [enabled, pathname]);
  return <PromotionsContext.Provider value={promotions}>{children}</PromotionsContext.Provider>;
}

function usePromotion(targetId) {
  return useContext(PromotionsContext)[targetId];
}

export function PromotionDisplay({ targetId, promotion: supplied, overlay = false, placement = "top" }) {
  const saved = usePromotion(targetId);
  const promotion = supplied === undefined ? saved : supplied;
  if (!promotion) return null;
  const offer = promotion.offerEnabled && promotion.offerTitle;
  const hasAmount = typeof promotion.amount === "number" && Number.isFinite(promotion.amount);
  const discounted = offer && hasAmount && typeof promotion.offerAmount === "number" && promotion.offerAmount < promotion.amount;
  if (!hasAmount && !offer) return null;
  return <span className={`promotion-display${overlay ? " promotion-overlay" : ""}${placement === "bottom" ? " promotion-bottom" : ""}`}>
    {offer && <span className="promotion-offer">{promotion.offerImage && <img className="promotion-mini-image" src={promotion.offerImage} alt={`${promotion.offerTitle} offer`} width="48" height="48" loading="lazy" />}<strong>{promotion.offerTitle}</strong></span>}
    {hasAmount && <span className="promotion-price"><span className="promotion-price-label">Package from</span><span>{discounted && <del>{formatAmount(promotion.amount)}</del>}<strong>{formatAmount(discounted ? promotion.offerAmount : promotion.amount)}</strong></span></span>}
  </span>;
}
