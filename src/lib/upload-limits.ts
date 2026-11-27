/** Limite d'envoi direct depuis le navigateur (le transfert serveur est plafonné à 16 Mo). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const tooBigMessage = (name: string) => `« ${name} » dépasse 15 Mo. Déposez les fichiers lourds sur Google Drive et ajoutez le lien.`;
