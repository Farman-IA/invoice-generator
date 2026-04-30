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
    rules: `- Contact récurrent : Alexiane BELMOSTEFAOUI
- Adresse : 4 rue Frédéric-Guillaume RAIFFEISEN, 67913 Strasbourg Cedex 9
- CONTEXTE : les factures CAP COMPETENCES contiennent TOUJOURS un "code session" au format XXXXXXX-XXXXXX-XXX (ex: 0028310-000062-001) associé à une date de prestation (ex: "14 repas complets le 21/01/2026 code session : 0028310-000062-001").
- RÈGLE IMPORTANTE : PRÉSERVE INTÉGRALEMENT ce code session et la date dans le champ "description" de la ligne. NE l'extrais PAS dans un autre champ.
- Exemple correct de ligne CIC : description: "Repas complet le 21/01/2026 code session : 0028310-000062-001", quantity: 14, unitPrice: 30, vatRate: 10`,
  },
]

export function renderRecurringClients(): string {
  return RECURRING_CLIENTS.map(c => `### ${c.name}\n${c.rules}`).join('\n\n')
}
