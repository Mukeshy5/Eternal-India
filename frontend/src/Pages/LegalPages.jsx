import "./LegalPages.css";

const termsSections = [
  {
    title: "Payment policy",
    points: [
      "We would be delighted to plan your holiday and confirm your reservation, subject to hotel availability when payment is made.",
      "Payment can be made to any of the accounts listed on our Online Payment page by NEFT, RTGS, online transfer, cash or cheque deposit.",
      "There is no additional charge when payment is transferred directly from your bank account to the company's current account.",
      "A minimum of 50% of the total package cost is accepted as the booking amount.",
    ],
  },
  {
    title: "Remarks",
    points: [
      "Hotels are subject to availability at the time of reservation.",
      "Base-category rooms are provided in each package. A supplement applies if a higher room category is requested.",
      "Air conditioning may not operate in hill stations.",
      "Rates may change without prior notice if services, including hotels or transportation, change.",
      "Sightseeing days may be rescheduled due to weather or to ensure smooth tour operations.",
      "Cancellation and other policies follow company and hotel norms.",
      "Travel to Rohtang Pass, if requested, involves additional expenses payable by the guest.",
      "Facilities in Himachal Pradesh may differ from those available in cities and other developed destinations.",
      "Quoted rates apply only to the sightseeing and hotels mentioned. Costs may change if either is changed.",
      "A quotation does not confirm a booking. Rates are valid only for the dates mentioned.",
    ],
  },
  {
    title: "Cancellation policy",
    points: [
      "Cancellation more than 30 days before the tour start date: 20% of the package cost is charged.",
      "Cancellation 16–30 days before the tour start date: 30% of the tour cost is charged as retention.",
      "Cancellation 7–15 days before the tour start date: 50% of the tour cost is charged as retention.",
      "Cancellations are not allowed within 7 days of the tour start date.",
      "The policy may vary during peak season; any changes will be communicated before confirmation.",
      "No refund is provided for no-shows.",
    ],
  },
];

const privacySections = [
  {
    title: "Privacy policy",
    points: [
      "No refund is made for unused accommodation, missed meals, transportation segments, sightseeing tours or other services due to bad weather, ill health, poor road conditions, roadblocks, strikes or other factors beyond our control. Unused services are neither refundable nor exchangeable.",
      "Room allocation is made by the hotel based on availability at check-in and the room category stated on the confirmation voucher.",
      "A claim relating to hotel services or amenities that do not meet expectations is considered on a case-by-case basis.",
      "Guests are requested to have the Aarogya Setu app installed on their mobile phone.",
      "During check-in, a guest who is sneezing or coughing, or has a body temperature of 98.6°F or above, may be asked to return or directed to a designated hospital to help prevent the spread of COVID-19.",
      "Only commitments and communications exchanged by email will apply.",
      "Confirming a package means the guest accepts all terms stated in the booking communication.",
      "Guests must follow the hotel's standard operating procedures as precautionary measures.",
    ],
  },
];

function PolicySections({ sections }) {
  return (
    <div className="legal-policy-sections">
      {sections.map((section) => (
        <section className="legal-policy-card" key={section.title}>
          <h2>{section.title}</h2>
          <ul>
            {section.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function TermsConditions() {
  return (
    <article className="legal-policy-page container section">
      <p className="eyebrow"><span />Plan with clarity</p>
      <h1>Terms &amp; Conditions</h1>
      <p className="legal-policy-intro">Please review the payment, travel and cancellation terms that apply to our tour quotations and bookings.</p>
      <PolicySections sections={termsSections} />
    </article>
  );
}

export function PrivacyPolicy() {
  return (
    <article className="legal-policy-page container section">
      <p className="eyebrow"><span />Your information and journey</p>
      <h1>Our Privacy Policy</h1>
      <p className="legal-policy-intro">Please review the following guest, service and communication policies for your booking.</p>
      <PolicySections sections={privacySections} />
    </article>
  );
}
