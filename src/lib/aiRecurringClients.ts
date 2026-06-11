// Specificites de clients recurrents — extraites du prompt pour rester
// editables sans toucher au scaffolding du prompt. Ajouter un client : pousser
// une nouvelle entree ici.
interface RecurringClient {
  name: string
  rules: string
}

export const RECURRING_CLIENTS: RecurringClient[] = [
  {
    name: 'Université de Lorraine (Chorus Pro - administration publique)',
    rules: `- Siège : 91 Avenue de la Libération, 54021 NANCY CEDEX
- CONTEXTE : pour facturer une collectivité/université française via Chorus Pro, il faut OBLIGATOIREMENT un "Code service" au format UL1XXXXXX (ex: UL1AVECEJ). Sans lui, la facture est refusée.
- Si l'utilisateur mentionne "code service", "Chorus", "UL1..." → remplis codeService
- N° de commande Univ Lorraine : 10 chiffres commençant par 4500 (ex: 4500821931) → purchaseOrder`,
  },
  {
    name: 'APAVE Exploitation France',
    rules: `- Siège : ZI Avenue Gay Lussac BP3, 33370 ARTIGUES PRES BORDEAUX
- N° de commande APAVE : 10 chiffres commençant par 800 (ex: 8000058218) → purchaseOrder
- Pas de code service Chorus Pro pour ce client.`,
  },
  {
    name: 'Allianz Vie (assurance - grand compte)',
    rules: `- Siège facturation : Tour Neptune – Case courrier 0139, 20 Place de Seine, 92086 PARIS LA DÉFENSE
- Service destinataire : "Factures Fournisseurs DCFG" → remplis clientDepartment
- Contact récurrent : Danielle DEL AGUILA → contactName
- RÈGLE : "Tour Neptune – Case courrier 0139" va dans clientAddressLine2 (pas clientAddress), et "20 Place de Seine" va dans clientAddress
- Exemple : clientName: "Allianz Vie", clientDepartment: "Factures Fournisseurs DCFG", contactName: "Danielle DEL AGUILA", clientAddress: "20 Place de Seine", clientAddressLine2: "Tour Neptune – Case courrier 0139", clientPostalCode: "92086", clientCity: "PARIS LA DÉFENSE"`,
  },
  {
    name: 'CIC / CAP COMPETENCES (formation professionnelle)',
    rules: `- Décomposition EXACTE de l'adresse (ne JAMAIS improviser une autre répartition) :
  clientAddress: "4 rue Frédéric-Guillaume Raiffeisen", clientPostalCode: "67913", clientCity: "STRASBOURG CEDEX 9".
  Ne RIEN mettre dans clientAddressLine2 ni clientDepartment pour ce client.
- Contact récurrent : Alexiane BELMOSTEFAOUI → contactName UNIQUEMENT (jamais dans clientDepartment).
- CONTEXTE : CAP COMPETENCES demande de facturer des déjeuners par SESSION de formation. Chaque session a : une date, un nombre de déjeuners (personnes), un responsable de groupe, et un "code session" au format XXXXXXX-XXXXXX-XXX (ex: 0028310-000062-001). Un même message peut contenir PLUSIEURS sessions.
- RÈGLE : chaque session = UNE ligne de facture séparée.
  quantity = nombre de déjeuners de la session.
  description = "Repas complets le JJ/MM/AAAA code session : XXXXXXX-XXXXXX-XXX".
  PRÉSERVE le code session à l'identique (chiffres et tirets exacts). Le responsable du groupe n'apparaît PAS sur la facture.
- Prix habituel : 30 € TTC par repas → amount: 30, amountKind: "unit_ttc". TVA : 10 (restauration sur place).
- Si l'utilisateur donne un montant TOTAL par session (pas un prix par personne) : ligne en quantity: 1, le nombre de repas passe dans la description (ex: "13 repas complets le 10/06/2026 code session : 0011263-001032-001"), et le montant total dans amount (amountKind: "total_ttc" ou "total_ht" selon l'énoncé).
- Exemple — "13 déjeuners le 10/06/2026 resp. GT FORMATION code session 0011263-001032-001, 14 déjeuners le 11/06/2026 resp. DELATTRE Sébastien code session 0012111-001029-001, 30 euros ttc par personne" →
  items: [
    {description: "Repas complets le 10/06/2026 code session : 0011263-001032-001", quantity: 13, amount: 30, amountKind: "unit_ttc", vatRate: 10},
    {description: "Repas complets le 11/06/2026 code session : 0012111-001029-001", quantity: 14, amount: 30, amountKind: "unit_ttc", vatRate: 10}
  ]`,
  },
]

export function renderRecurringClients(): string {
  return RECURRING_CLIENTS.map(c => `### ${c.name}\n${c.rules}`).join('\n\n')
}
