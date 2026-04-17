// Script à coller dans la console du navigateur (Cmd+Option+J sur Mac)
// pour pré-remplir la facture avec les données de l'Université de Lorraine

localStorage.setItem(
  "issuer-profile",
  JSON.stringify({
    companyName: "Restaurant Garden Golf Metz Technopôle",
    legalForm: "",
    address: "3 rue Félix SAVART",
    postalCode: "57 070",
    city: "METZ",
    phone: "03.87.78.46.63",
    siret: "493 019 673 00018",
    siren: "",
    apeNaf: "",
    tvaNumber: "",
    shareCapital: "",
    rcsCity: "",
    rcProInsurer: "",
    rcProScope: "",
    bankName: "CIC Laxou champ le boeuf",
    iban: "FR76 3008 7336 0700 0774 4690 145",
    bic: "CMCIFRPP",
    logo: "",
  }),
);

localStorage.setItem(
  "client-current",
  JSON.stringify({
    companyName: "Université de Lorraine",
    contactName: "Agence Comptable/Bureau Facturier",
    address: "91 Avenue de la Libération",
    postalCode: "54021",
    city: "NANCY CEDEX",
    siren: "130 015 506 00012",
    tvaNumber: "",
    codeService: "UL1AVECEJ",
  }),
);

localStorage.setItem(
  "invoice-current",
  JSON.stringify({
    number: "2703202608",
    issueDate: "2026-03-27",
    deliveryDate: "2026-03-27",
    dueDate: "2026-04-26",
    purchaseOrder: "4500820422",
    paymentTerms: "Paiement à réception de facture à 30 jours",
    notes: "",
    items: [
      {
        id: crypto.randomUUID(),
        description: "Repas midi — restauration sur place",
        quantity: 6,
        unitPrice: 17.27,
        vatRate: 10,
      },
      {
        id: crypto.randomUUID(),
        description: "Boissons (eau, café)",
        quantity: 6,
        unitPrice: 0.82,
        vatRate: 10,
      },
    ],
  }),
);

localStorage.setItem("invoice-counter", JSON.stringify(1));

// Recharger la page pour voir les données
location.reload();
