export function detectLanguage(text: string): "en" | "ar" {
  return /[\u0600-\u06ff]/.test(text) ? "ar" : "en";
}
export function isPromptInjection(text: string) {
  return /ignore\s+(all\s+)?(previous|prior|above)\s+instructions|system\s*prompt|you are now|developer\s*mode|\[\s*(system|developer|assistant)\s*\]|<\/?(system|developer|assistant)>|(?:^|\n)\s*(system|developer|assistant)\s*:|تجاهل.*(تعليمات|التعليمات)|انس.*التعليمات|موجه النظام|برومبت النظام|أنت الآن|انت الان|وضع المطور|تعليمات النظام|(?:^|\n)\s*(النظام|المطور|المساعد)\s*:|["']role["']\s*:\s*["'](?:system|developer|assistant)["']/i.test(
    text,
  );
}
export function isMedicalAdvice(text: string) {
  return /\b(dosage|diagnos\w*|what medicine|which medicine|prescri\w*|antibiotic\w*|how many pills|what medication)\b|جرع[ةه]|تشخيص|اي دواء|أي دواء|ما الدواء|دواء.*(?:ايه|إيه|اخد|آخذ)|(?:ايه|إيه).*دواء|علاج.*(آخذ|اخذ)|مضاد حيوي/i.test(
    text,
  );
}
export function isConfirmation(text: string) {
  return /^(yes|yeah|yep|confirm|sure|ok|okay|نعم|أكيد|اكيد|تمام|موافق)[.!\s]*$/i.test(
    text.trim(),
  );
}
export function isRejection(text: string) {
  return /^(no|no thanks|decline|never mind|لا|إلغاء|الغاء|cancel proposal)[.!\s]*$/i.test(
    text.trim(),
  );
}
