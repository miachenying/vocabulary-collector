export function sameVocabularyIdentity(leftUserId: string, leftCanonical: string, rightUserId: string, rightCanonical: string) {
  return leftUserId === rightUserId && leftCanonical === rightCanonical;
}
