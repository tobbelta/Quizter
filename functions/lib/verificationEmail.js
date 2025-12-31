export const buildVerificationEmail = ({ name, verifyUrl }) => {
  const safeName = name ? `Hej ${name}!` : 'Hej!';
  const text = `${safeName}\n\nBekräfta din e-postadress för Quizter genom att öppna länken nedan:\n${verifyUrl}\n\nLänken är giltig i 24 timmar.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>${safeName}</h2>
      <p>Bekräfta din e-postadress för Quizter genom att klicka på länken nedan:</p>
      <p><a href="${verifyUrl}" style="color: #0ea5e9;">Bekräfta e-post</a></p>
      <p style="font-size: 12px; color: #555;">Länken är giltig i 24 timmar.</p>
    </div>
  `;
  return { subject: 'Bekräfta din e-postadress', text, html };
};
