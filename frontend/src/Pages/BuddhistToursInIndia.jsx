import { Link } from "react-router-dom";
import { Eyebrow, Icon } from "../Common/SiteUI";
import { TravelHero } from "../Common/TravelUI";
import buddhistImage from "../assets/buddhist/buddhist.jpg";

const history = [
  {
    heading: "Siddhartha Gautama's early life",
    paragraphs: [
      "Buddhism is a major world religion and philosophical tradition founded on the teachings of Siddhartha Gautama, known as the Buddha, or “the Awakened One.” Accounts of his life were preserved in Buddhist traditions, and details differ between early sources.",
      "According to these accounts, Siddhartha was born into the Shakya community. His father, Suddhodana, was a leader of the clan, whose capital was Kapilavastu. His mother, Queen Maya, gave birth to him at Lumbini, beneath a sal tree. He was named Siddhartha, a name traditionally understood as “one who achieves his aim.” The sage Asita is said to have foretold that the child would become either a great ruler or a spiritual teacher.",
      "Tradition says Siddhartha married Yasodhara as a young man and they had a son, Rahula. He grew up amid the comforts of the royal household, but came to feel that wealth and status could not answer the deeper questions of life.",
    ],
  },
  {
    heading: "The four sights & the search for a way through suffering",
    paragraphs: [
      "At around the age of 29, Siddhartha is said to have left the palace and encountered an old person, a sick person, a dead body and a wandering ascetic. These sights brought home the realities of ageing, illness and death, and inspired him to search for a way to understand and overcome suffering.",
      "Leaving his princely life behind, he became a mendicant and travelled to Rajagaha, in the kingdom of Magadha. There, King Bimbisara is said to have offered him a place at court. Siddhartha declined, while promising to return if his search brought him the understanding he sought.",
    ],
  },
  {
    heading: "Teachers, austerity & the Middle Way",
    paragraphs: [
      "Siddhartha studied meditation with teachers including Alara Kalama and Uddaka Ramaputta. He mastered their practices but continued his search. With a group of five companions led by Kaundinya, he then pursued severe ascetic practices and extreme fasting.",
      "After nearly starving himself, Siddhartha recalled a peaceful meditative state from childhood. He concluded that neither indulgence nor self-mortification offered the answer. The Middle Way—the path of moderation between these extremes—became central to his teaching.",
    ],
  },
  {
    heading: "Awakening beneath the Bodhi tree",
    paragraphs: [
      "At Bodh Gaya, Siddhartha sat in meditation beneath a tree later known as the Bodhi tree. Buddhist tradition says that after a prolonged period of meditation he attained awakening and became the Buddha. His five companions had left, believing he had abandoned the search.",
      "The Buddha’s awakening is associated with insight into suffering, its causes, its ending and the path leading to its ending. These teachings are known as the Four Noble Truths. Nirvana describes liberation from ignorance, greed and hatred, and the peace that follows.",
    ],
  },
  {
    heading: "The first teaching & the beginning of the Sangha",
    paragraphs: [
      "After his awakening, the Buddha travelled to the Deer Park at Sarnath, near Varanasi. There he gave his first teaching to the five former companions, setting in motion what Buddhist tradition calls the Wheel of Dharma. The five became his first monastic followers, forming the beginning of the Sangha.",
      "The Buddha later taught merchants Tapussa and Bhallika, remembered as among his first lay followers. As the teaching community grew, it welcomed people from different backgrounds. Accounts describe the conversion of Yasa and his friends, followed by the Kassapa brothers and their followers; the Sangha is traditionally said to have grown to around a thousand members.",
    ],
  },
  {
    heading: "Teaching across the Gangetic plain",
    paragraphs: [
      "For the rest of his life, the Buddha travelled and taught across the Gangetic plain, in areas that are now part of Uttar Pradesh and Bihar. Buddhist stories remember encounters with people from many walks of life, including the feared Angulimala and Alavaka, and emphasise that the path was open beyond social rank or caste.",
      "The Sangha travelled for much of the year. During the rainy-season retreat, known as Vassana, monks and nuns stayed in monasteries or other sheltered places. The first retreat is associated with Varanasi; later accounts describe the Buddha spending several seasons at Veluvana, the Bamboo Grove monastery in Rajagaha.",
      "At Rajagaha, Sariputta and Maudgalyayana became two of the Buddha’s foremost disciples after hearing the teaching from Assaji. They joined a wider community of close students that included Mahakasyapa, Ananda and Anuruddha.",
    ],
  },
  {
    heading: "Return to Kapilavastu & the monastic community",
    paragraphs: [
      "After hearing of his awakening, King Suddhodana sent messengers to invite his son home. Buddhist accounts say that the first groups joined the Sangha before delivering the invitation; eventually Kaludayi, a childhood friend of Siddhartha, conveyed the message. The Buddha later returned to Kapilavastu, teaching along the way.",
      "Several members of the royal family are remembered as joining the community, including Siddhartha’s son Rahula, his cousin Anuruddha and his half-brother Nanda. Rahula was still a child. The tradition also names a group of foremost disciples whose lives and teachings became important to Buddhist communities.",
      "The stories of Mahapajapati, the Buddha’s foster mother, and Ananda are central to accounts of the order of nuns. After initially hesitating, the Buddha is said to have agreed to ordain women. Early monastic traditions prescribed additional rules for nuns.",
    ],
  },
  {
    heading: "Patronage & Buddhism's wider reach",
    paragraphs: [
      "The Buddha’s teaching attracted support from rulers and householders. King Bimbisara of Magadha is remembered as an early royal patron, helping establish places where the monastic community could stay and practise.",
      "Centuries later, the Mauryan emperor Ashoka became an important patron of Buddhism. Following the Kalinga war, he supported the tradition and sponsored missions beyond his empire. Buddhist communities and teachings subsequently spread across Asia, taking root in many different cultures.",
    ],
  },
  {
    heading: "Teachings preserved & Parinirvana",
    paragraphs: [
      "The Buddha did not appoint a personal successor. He encouraged his followers to practise and seek liberation for themselves. His teachings were transmitted orally, and Buddhist councils were later held to recite, preserve and discuss the teachings and monastic discipline.",
      "Buddhist tradition places the Buddha’s Parinirvana at Kusinara, identified with modern Kushinagar in Uttar Pradesh. Today, pilgrimage routes connect places associated with his birth, awakening, first teaching and final passing, as well as many sites shaped by the communities that followed.",
    ],
  },
];

const pilgrimagePlaces = ["Lumbini", "Bodh Gaya", "Sarnath", "Kushinagar"];

const itinerary = [
  {
    day: "Day 01",
    title: "Arrive in Delhi",
    paragraphs: [
      "Upon arrival, transfer to your hotel.",
      "Overnight stay at the hotel in Delhi.",
    ],
  },
  {
    day: "Day 02",
    title: "Delhi – Varanasi by flight",
    paragraphs: [
      "After breakfast, enjoy a half-day tour of Delhi. Visit Raj Ghat, the memorial to Mahatma Gandhi, designed with a simplicity that reflects his life.",
      "Drive past the Red Fort, the 17th-century Mughal fort and palace in the historic walled city of Shahjahanabad. See India Gate, designed by Sir Edwin Lutyens and built in 1931 to commemorate soldiers who died in the First World War and the Third Anglo-Afghan War.",
      "See the President's House and Parliament House from outside, and visit Qutab Minar. After lunch at a restaurant, transfer to the airport for your flight to Varanasi.",
      "On arrival, transfer to your hotel. Overnight stay at the hotel in Varanasi.",
    ],
  },
  {
    day: "Day 03",
    title: "Varanasi – Bodhgaya (240 km / approx. 6 hours)",
    paragraphs: [
      "Begin early with a boat ride on the holy River Ganga. After breakfast, visit Bharat Mata Temple, built in 1936 at the Kashi Vidyapeeth campus and inaugurated by Mahatma Gandhi. The temple houses a marble relief map of undivided India.",
      "Continue to Banaras Hindu University (BHU), one of Asia's largest residential universities, and Durga Mandir in Ramnagar.",
      "Take an excursion to Sarnath, about 10 km from Varanasi. This ancient pilgrimage city is known for its ghats, temples and long history. After lunch at the hotel, drive to Bodhgaya and transfer to your hotel on arrival.",
      "Overnight stay at the hotel in Bodhgaya.",
    ],
  },
  {
    day: "Day 04",
    title: "Bodhgaya – Nalanda – Rajgir",
    paragraphs: [
      "After breakfast, visit Bodhgaya's Mahabodhi Temple, which stands near the Bodhi Tree where Buddhist tradition says Gautama Buddha attained enlightenment. The temple rises approximately 170 feet.",
      "Visit the Mahabodhi Tree, revered as the place of the Buddha's awakening and a setting for meditation.",
      "Drive to Rajgir and visit the historic city, once the capital of Magadha and an important centre in the 6th century BCE. Continue to Nalanda, the site of the renowned ancient residential university where, according to historical accounts, thousands of teachers and students gathered from across the Buddhist world.",
      "Return to Rajgir in the evening. Overnight stay at the hotel in Rajgir.",
    ],
  },
  {
    day: "Day 05",
    title: "Rajgir – Vaishali – Kushinagar",
    paragraphs: [
      "After breakfast, drive to Kushinagar, visiting Vaishali en route. See the Ashokan Pillar, a single-piece red sandstone column approximately 18.3 metres high, topped by a lion.",
      "Visit Fort Vishal, associated with the ancient republic of Vaishali, and the museum, which houses antiquities discovered at sites in the area.",
      "Continue to Kushinagar. Overnight stay at the hotel.",
    ],
  },
  {
    day: "Day 06",
    title: "Kushinagar – Sravasti (230 km / approx. 6 hours)",
    paragraphs: [
      "After breakfast, visit Kushinagar's Nirvana Stupa and temple. The brick stupa was excavated by Carlleyle in 1867. The site is important to Buddhist pilgrims, and the temple is home to a large reclining Buddha statue.",
      "Visit the Mahaparinirvana Temple and its more-than-six-metre-long reclining Buddha image, carved from Chunar sandstone and discovered during excavations in 1876.",
      "Continue to Sravasti. Overnight stay at the hotel in Sravasti.",
    ],
  },
  {
    day: "Day 07",
    title: "Sravasti – Lucknow (170 km / approx. 5 hours)",
    paragraphs: [
      "After breakfast, visit Sravasti. See the Ananda Bodhi Tree, associated with the Buddha's meditation, and Jetavana, the monastery and park where Buddhist tradition remembers the Buddha and his followers staying. The site includes remains and sculptures associated with the ancient monastery.",
      "Visit Shobhanath Temple, revered by Jain pilgrims as the birthplace of Sambhavnath.",
      "Continue to Lucknow. Overnight stay at the hotel in Lucknow.",
    ],
  },
  {
    day: "Day 08",
    title: "Lucknow – Sankisa – Agra (approx. 200 km / 5 hours)",
    paragraphs: [
      "After breakfast, drive towards Agra and visit Sankisa en route. Sankisa is associated with Buddhist traditions about the Buddha's return from heaven and is a quiet pilgrimage destination.",
      "After your visit, continue to Agra. Overnight stay at the hotel in Agra.",
    ],
  },
  {
    day: "Day 09",
    title: "Agra – Delhi",
    paragraphs: [
      "After breakfast, enjoy sightseeing in Agra, visiting the Taj Mahal and Agra Fort. Built by Emperor Shah Jahan between 1631 and 1648, the Taj Mahal is a celebrated marble monument commissioned in memory of his wife Mumtaz Mahal.",
      "Explore Agra Fort, whose towers, ramparts and gateways reflect the power of the Mughal Empire. Construction began under Emperor Akbar and was continued by his grandson Shah Jahan.",
      "Drive to Delhi. Overnight stay at the hotel in Delhi.",
    ],
  },
  {
    day: "Day 10",
    title: "Departure by flight",
    paragraphs: [
      "After breakfast, transfer to the airport for your onward flight.",
    ],
  },
];

export default function BuddhistToursInIndia() {
  return <>
    <nav className="container travel-breadcrumbs" aria-label="Breadcrumb">
      <Link to="/">Home</Link><span aria-hidden="true">/</span>
      <span aria-current="page">Buddhist tours in India</span>
    </nav>
    <TravelHero
      label="Buddhist heritage · India"
      title={<>Buddhist tours<br /><em>in India.</em></>}
      description="Explore the life and teachings of the Buddha through the places, stories and living traditions that continue to draw pilgrims and curious travellers."
      image={buddhistImage}
      alt="A seated Buddha statue framed by trees"
      caption="Buddhist heritage · India"
    >
      <Link className="button" to="/request-quote?destination=Buddhist%20Tours%20in%20India">
        Plan this journey <Icon size={18} />
      </Link>
    </TravelHero>
    <section className="container buddhist-tour-content" aria-labelledby="buddhist-history-title">
      <div className="buddhist-tour-intro">
        <Eyebrow>A life, a teaching, a pilgrimage</Eyebrow>
        <h2 id="buddhist-history-title">The story of the Buddha.</h2>
        <p>Follow the journey from Siddhartha Gautama’s early life to the communities and teachings that helped Buddhism travel across India and beyond.</p>
        <div className="buddhist-pilgrimage-list" aria-label="Key pilgrimage places">
          {pilgrimagePlaces.map((place, index) => <span key={place}><Icon name="pin" size={16} />{String(index + 1).padStart(2, "0")} · {place}</span>)}
        </div>
      </div>
      <div className="buddhist-history-list">
        {history.map((section, index) => <article className="buddhist-history-section" key={section.heading}>
          <span className="buddhist-history-number">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>{section.heading}</h3>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </article>)}
      </div>
    </section>
    <section className="container buddhist-itinerary-section" aria-labelledby="buddhist-itinerary-heading">
      <div className="buddhist-tour-intro">
        <Eyebrow>A 10-day pilgrimage route</Eyebrow>
        <h2 id="buddhist-itinerary-heading">Delhi, Varanasi &amp; the Buddhist circuit.</h2>
        <p>
          A suggested journey through Delhi, Varanasi, Bodhgaya, Nalanda,
          Rajgir, Vaishali, Kushinagar, Sravasti, Sankisa and Agra. Travel
          times and visits can be adjusted to suit your dates and confirmed
          arrangements.
        </p>
      </div>
      <details className="travel-itinerary buddhist-itinerary">
        <summary>View the day-by-day itinerary <span>10 days</span></summary>
        <ol className="travel-itinerary-days">
          {itinerary.map((day, index) => (
            <li key={day.day}>
              <span className="travel-itinerary-day">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <span className="travel-itinerary-kicker">{day.day}</span>
                <h3>{day.title}</h3>
                {day.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
    <section className="container buddhist-tour-cta">
      <div><Eyebrow>Make it your own</Eyebrow><h2>Plan a thoughtful pilgrimage.</h2><p>Share your dates, group size and the places you hope to visit. Our team can help shape a route around your interests and pace.</p></div>
      <Link className="button" to="/request-quote?destination=Buddhist%20Tours%20in%20India">Request a personal quote <Icon size={18} /></Link>
    </section>
  </>;
}
