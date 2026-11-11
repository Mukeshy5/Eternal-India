import "./LegalPages.css";

const termsSections = [
  {
    title: "Using this website",
    points: [
      "These Terms and Conditions apply to your use of this website, including the information and services offered on it.",
      "By accessing and using the website, you agree to be bound by these Conditions. Please read them carefully before proceeding. If you do not accept these Conditions, you must refrain from using the website.",
      "These Conditions must be read together with any other applicable Terms and Conditions governing the use of this website.",
      "All correspondence in respect of tour or travel service bookings should be addressed to M/s. ETERNAL INDIA.",
    ],
  },
  {
    title: "Reservations",
    points: [
      "Bookings must be made through our New Delhi, India office. Confirmed bookings must be sent with 50% of the package price. The balance is payable four weeks before the trip begins. For bookings made less than four weeks before departure, the full charge is payable at the time of booking. The company reserves the right to treat failure to follow these payment terms as cancellation of the booking.",
      "When confirming bookings, we communicate supplier deposit deadlines. Missing a deadline may result in suppliers cancelling confirmed bookings. In that case, we are not responsible for the cancellation and cannot honor the previous quotation. Reinstating the booking may change its cost, depending on suppliers such as hotels, transport providers, airlines and railways.",
    ],
  },
  {
    title: "Payment",
    points: [
      "ETERNAL INDIA accepts payment in cash or by wire transfer directly to our bank.",
      "Account name: ETERNAL INDIA. Bank: AXIS BANK. Current account number: 921020029366590. SWIFT code: AXISINBB1600. IFSC: UTIB0001600. Beneficiary: ETERNAL INDIA.",
      "For bank transfers, local bank charges and charges from the Indian bank must be added to the actual invoice amount.",
      "Foreign remittance bank transaction charges: up to US$10,000 — US$35; US$10,000–US$40,000 — US$50; US$40,000 and above — please check with us.",
    ],
  },
  {
    title: "Cancellation",
    points: [
      "Cancellation notice must be made in writing to ETERNAL INDIA.",
      "60 days or more before departure: non-refundable deposit, if any.",
      "37–59 days before departure: US$50 and non-refundable deposit, if any.",
      "16–36 days before departure: 50% of the tour fare and non-refundable deposit, if any.",
      "7–15 days before departure: 75% of the tour fare and non-refundable deposit, if any.",
      "Within one week of departure: 100%.",
    ],
  },
  {
    title: "Children policy",
    points: [
      "Children aged 0–5 years: free without an extra bed.",
      "Children aged 5 up to 12 years: 70% of the adult cost with an extra bed.",
      "Children aged 5 up to 12 years: 50% of the adult cost without an extra bed.",
      "Children aged 12 years and above are treated as adults.",
    ],
  },
  {
    title: "Hotels policy",
    points: [
      "Check-in time is 12:00 hrs and check-out time is 11:00 hrs.",
      "Early check-in and late check-out are subject to availability and the discretion of hotel management.",
      "Early breakfast depends on the hotel.",
      "Hotel classifications follow ETERNAL INDIA classifications, based on popular and compatible facilities offered. Guests are advised to review hotel websites and raise any questions before making reservations. Complaints about this will not be accepted after the tour.",
      "Twin rooms are subject to availability.",
    ],
  },
  {
    title: "Refunds",
    points: [
      "No refund or exchange can be made for accommodation, meals, sightseeing tours, transport, admission fees, special shows or other services included in the tour fare but not used by the client.",
      "If additional services are needed due to bad weather or another reason beyond our control, the passenger is responsible for their own hotels, meals, flight tickets, train tickets, transport and other expenses. Neither ETERNAL INDIA nor participating suppliers or hotels are responsible for additional expenses. We are not responsible for weather conditions, flight or train delays, visa problems or road transport.",
      "Once a tour has started, there will be no refund for unused services. Meals at city restaurants are provided at those restaurants on a fixed menu basis or as agreed; they cannot be changed to hotel meals or à la carte. Changes may be made by guests through direct payment, but no refund will be provided.",
    ],
  },
  {
    title: "Responsibility",
    points: [
      "Packages are sold under the business management of ETERNAL INDIA. We reserve the right to cancel or alter a package as conditions require.",
      "Neither ETERNAL INDIA nor participating suppliers or hotels are responsible for additional expenses resulting from loss, delay or damage caused by accidents, equipment failure, industrial action, illness, bad weather, strikes, riots, war, civil disturbances, fire, floods, roadblocks, acts of God, acts of government or other authorities, or other unforeseen conditions.",
    ],
  },
  {
    title: "Meals and beverages",
    points: [
      "In India, Nepal, Bhutan, Maldives and Sri Lanka, beverages (alcoholic or non-alcoholic) and food brought from outside are not permitted in local restaurant and hotel restaurants.",
      "Our cost does not include drinks, including bottled mineral water, with meals at local restaurants or hotels unless specified when finalizing the tour cost. Filtered water is provided.",
      "Confirmed meals are provided only at the specified hotels or restaurants. Changes can be made only by direct payment; no refund will be made.",
      "Packed lunch or dinner will be provided according to the agreed itinerary and menu. If suppliers make a sudden change to packed meals, their provision must be accepted and no claim will be entertained.",
    ],
  },
  {
    title: "Air ticket cancellation and layover policy",
    points: [
      "Air tickets are subject to airline terms and the arrangements discussed when finalizing international or domestic air ticket costs. In the event of cancellation of international or domestic flights, low-cost airlines (LCC) do not provide accommodation or other land arrangements.",
    ],
  },
  {
    title: "Railway ticket cancellation",
    points: [
      "There will be no refund for train tickets once tours start. A request to change travel dates must be made at least 30 days before the journey begins.",
      "Confirmed berths or seats depend on availability. Indian Railways bookings open 120 days in advance and are then available on a first-come, first-served basis.",
    ],
  },
  {
    title: "Complaints",
    points: [
      "If a customer is dissatisfied with services, the issue must be brought to our attention immediately during the trip so it can be addressed. Post-tour complaints will not be considered.",
    ],
  },
  {
    title: "Other conditions",
    points: [
      "Visits to wildlife parks, adventure activities and similar experiences are at the guest's own risk.",
      "Optional tours and additional services are available at additional cost and on a direct-payment basis.",
      "Tour operators or guests must arrange their own insurance in their country of residence.",
      "Rates are subject to change without prior notice unless full payment has been received.",
    ],
  },
];

const privacySections = [
  {
    title: "Payment policy",
    points: [
      "We would be delighted to plan your holiday and confirm your reservation depending upon the availability from the hotels at the time you will make payments.",
      "You can make the payment in any of the below mentioned accounts through NEFT/ RTGS, online transfer and by cash or cheque deposit.",
      "There will be no additional charge if payment is directly transferred from your bank account to company’s current accounts.",
      "Minimum 50% of the total package cost will be accepted as the booking amount.",
    ],
  },
  {
    title: "Remarks",
    points: [
      "Hotels are subject to availability at the time of reservation.",
      "Base category of rooms will be provided in every package category. If guest needs to have higher category of rooms supplement cost will be charges.",
      "AC will not work in the hill stations.",
      "Rates are subject to change without any prior notice if there is change in services (like hotel and transportation).",
      "We may reschedule the sightseeing days subject to weather conditions & to ensure smooth execution of tours.",
      "Cancellation and other policies are as per the norms of the company/ hotel.",
      "If guest is willing to go to Rohtang pass, he or she has to bear extra expenses.",
      "Though Himachal have been witnessing a huge tourist growth but the facilities available cannot be matched to those available in the Cities and other developed destination.",
      "Mentioned rates are applicable for above based sightseeing tours and with the mentioned hotels only. In case of change in sightseeing tours and hotels cost will differ.",
      "This is just a quotation; no bookings have made till date. Rates will be valid for mentioned dates only.",
    ],
  },
  {
    title: "Privacy policy",
    points: [
      "No refund will be made for any unused accommodation, missed meals, transportation segments, sightseeing tours or any other service due to bad weather, ill health, bad road condition, road blocks, strikes or any other factor which is beyond our control. Such unused items are neither refundable nor exchangeable.",
      "Room allocation is done by the hotel depending upon availability at the time of check-in in the category of room as specified on your confirmation voucher.",
      "No refund shall be claimed, if the services & amenities of hotel were not up to your expectations, it will be considered on case to case basis.",
      "Guest to be requested to have Arogya Setu App installed in their mobile phone.",
      "During Check-in if guest is sneezing or coughing, or with body temperature of 98.6*F or more should be politely asked to return or directed to a designated hospital to avoid spread of COVID-19.",
      "Only the commitment’s/ communication exchanged through mail will be applicable.",
      "Confirming package means acceptance of all the terms mentioned in this mail by the guest.",
      "Guest strictly needs to follow SOP’s of hotels as precautionary measures during COVID -19 to avoid the spread of COVID-19.",
    ],
  },
  {
    title: "Cancellation policy",
    points: [
      "Cancellation before 30 days of start date will be charged, 20% of the package cost.",
      "Cancellations between 16 days to 30 days before start date, 30% of tour cost would be charged as retention.",
      "Cancellations between 07 days to 15 days before start date, 50% of tour cost would be charged as retention.",
      "No cancellation will be allowed within 7 days of Starting tour.",
      "Above policy may vary during peak season and any changes will be communicated prior to confirmation.",
      "There will be no refunds for no-shows.",
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
      <p className="legal-policy-intro">Please review the terms governing website use, reservations, payments, cancellations and travel services.</p>
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
