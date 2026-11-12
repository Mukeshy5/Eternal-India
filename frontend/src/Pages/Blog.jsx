import { useState } from "react";
import { Link } from "react-router-dom";
import { Eyebrow, Icon, PageIntro } from "../Common/SiteUI";

const chitrakootHighlights = [
  {
    title: "Sitapur",
    text: "The main locality of Chitrakoot Dham lies on the Payaswini River. Formerly known as Jaisinghpur, it is home to the Uttar Pradesh Tourism Department office and a tourist guest house.",
  },
  {
    title: "Payaswini River (Mandakini)",
    text: "The Payaswini stream, flowing by Anusuya Ashram near the Madhya Pradesh border, is known here as the Mandakini. Tradition says Lord Ram offered prayers for his father Dasharatha here. Around 24 ghats line the river, including Ramghat, Dhritakullya Ghat, Kailash Ghat and Raghav Prayag Ghat.",
  },
  {
    title: "Hanuman Dhara",
    text: "About 5 km from Sitapur, this hilltop temple is reached by around 355 steps. Sita Ki Rasoi and other temples sit higher on the hill, while a natural spring flows from the rocks onto the Hanuman shrine.",
  },
  {
    title: "Ramghat",
    text: "The principal ghat on the Payaswini–Mandakini is associated with Lord Ram and the poet Tulsidas. A traditional couplet recalls Ram receiving a sandalwood tilak from Tulsidas during prayers. A yagyavedi above the ghat is said to mark the place where Brahma performed a yajna.",
  },
  {
    title: "Matyagajendranath Swami",
    text: "This Shiva temple stands on Ramghat. Local tradition says Lord Ram installed the shivalinga during his exile. Devotees come here to pray for relief from sorrow, fear and distress.",
  },
  {
    title: "Kamadgiri / Kamtanath",
    text: "The 5 km parikrama around Kamadgiri Mountain is a central pilgrimage in Chitrakoot. The path passes temples and shrines across Uttar Pradesh and Madhya Pradesh. Tradition associates the hill with Lord Ram's stay during exile, and many devotees make the circuit, especially on the new-moon day.",
  },
  {
    title: "Ram Darshan",
    text: "Around 8 km from Chitrakoot, this gallery presents stories from the Ramayana. The supplied visitor information lists a nominal entry fee and opening hours from 9 a.m. to 5 p.m.; check locally before visiting as timings and fees may change.",
  },
  {
    title: "Aarogyadham",
    text: "About 5 km away, Aarogyadham offers Ayurvedic and naturopathy facilities, along with an attractive garden.",
  },
  {
    title: "Ganeshbagh",
    text: "Around 10 km away on the Karvi–Devangana road, Ganeshbagh was built by Vinayak Rao Peshwa in the early 19th century. Its carved six-sided Shiva temple, domes, large tank and seven-storey stepwell show fine architecture; the site is sometimes called Mini Khajuraho.",
  },
  {
    title: "Lakshaman Pahari",
    text: "Reached by around 150 steps on a hill along the parikrama route between Bharat Milap and Dvitiya Mukhar Vind, this place is traditionally associated with Lakshman during Ram's exile.",
  },
  {
    title: "Ram Shaiya",
    text: "On the route between Bharat Koop and Sitapur, a flat rock bears impressions said to resemble two people resting with a bow. Local belief associates them with Ram and Sita pausing during their forest journey.",
  },
  {
    title: "Bharat Milap",
    text: "This forested area is associated with the meeting of Bharat and Ram. Nearby are square rocks, a spring, a cave with a Hanuman idol and Viradh Kund, which local stories connect with the demon Viradh.",
  },
  {
    title: "Devangana Kotitirtha",
    text: "About 13 km away in the Vindhya hills, this scenic place has a large cave and a Hanuman temple and is known as a quiet spot for meditation.",
  },
  {
    title: "Bankesidha",
    text: "Around 11 km from Chitrakoot and 3 km southeast of Ganeshbagh, this natural cave sits against the Vindhya hills. Steps lead to a spacious rock shelter, where a spring falls over the northern side of the cave.",
  },
  {
    title: "Janaki Kund",
    text: "About 5 km from Sitapur beside the Mandakini, Janaki Kund is traditionally associated with Sita's bathing place during exile. Clear water and crystal-like rocks add to its natural beauty.",
  },
  {
    title: "Anusuya Ashram",
    text: "Around 14 km from Sitapur on the Mandakini, the ancient ashram is associated with the sage Atri and Anusuya. Tradition says Sita received teachings from Anusuya during the exile.",
  },
  {
    title: "Gupta Godavari",
    text: "About 19 km away, this cave has natural springs and flowing water. Visitors pass through sections of the cave by wading through knee-deep water.",
  },
];

const nearbyChitrakootPlaces = [
  {
    title: "Valmiki Ashram · 20 km",
    text: "Tradition connects the ashram near Chitrakoot with Maharishi Valmiki and Ram's journey from Prayag. Local accounts identify more than one place with the sage's hermitage.",
  },
  {
    title: "Bharat Koop · 18 km",
    text: "An old well on the road towards Banda, believed to hold water brought from sacred rivers for Ram's coronation. A Ram-Bharat temple stands nearby.",
  },
  {
    title: "Rajapur · 45 km",
    text: "A town on the Yamuna associated with Goswami Tulsidas. Temples and a collection connected with the Ramcharitmanas are among its points of interest.",
  },
  {
    title: "Madfa · 30 km",
    text: "Known for the hermitage associated with Sage Mandava and remains linked to the Chandela period. Places to see include Balaji Temple, Panchmukhi Shiva Temple and Papmochan Sarovar.",
  },
  {
    title: "Khajuraho · 135 km",
    text: "A UNESCO World Heritage destination celebrated for its Chandela-era temples, intricate carvings and remarkable architecture.",
  },
  {
    title: "Maihar · 123 km",
    text: "A pilgrimage town in Madhya Pradesh known for the hilltop Maa Sharda Devi temple. A ropeway connects the town with the shrine.",
  },
  {
    title: "Kalinjar · 76 km",
    text: "A historic fort in the Vindhya range, with ancient gateways and the Neelkanth Temple. Local legends associate the hill with Lord Shiva.",
  },
  {
    title: "Mahoba · 126 km",
    text: "A historic city associated with Alha and Udal, known for its lakes and temples, including the Sun Temple at Rahela Sagar.",
  },
];

const chitrakootFestivals = [
  ["Ramayana Mela", "February–March"],
  ["Ram Navami", "March–April"],
  ["Shravan Jhoola", "August"],
  ["Navratri", "October–November"],
  ["Vijayadashami", "October–November"],
  ["Deepdan during Diwali", "October–November"],
  ["Amavasya observances", "Dates vary"],
];

const chitrakootLodging = [
  "Jaipuriya Bhavan, Sitapur",
  "Radhika Bhavan, Sitapur",
  "Shreeji Bhavan, Sitapur",
  "Kamadgiri Bhavan, Ramghat",
  "Vinod Lodge, Ramghat",
  "Pitra Smriti Vishram Griha, Ramghat",
  "Mandakini Satsang Bhavan, Sitapur Road",
  "Hotel Ramkripa Inn, near the municipality, Karvi",
  "Brijrani Guest House, near Karvi Railway Station",
  "Agrawal Guest House, near Karvi Railway Station",
  "Krishna Lodge, near Karvi Railway Station",
  "Madhya Pradesh Tourism Tourist Bungalow, Ramghat",
];

const biharJainPlaces = [
  {
    title: "Kamaldah · Patna",
    text: "At Kamaldah in Gulzarbagh, a high mound of brick ruins is topped by two Jain temples. The site includes a mausoleum associated with Jain teacher Sthulabhadra and a temple dedicated to Sudarshan Swami.",
  },
  {
    title: "Kund Gram · Muzaffarpur",
    text: "Jain tradition identifies Kundagrama as the birthplace of Mahavira and nearby Vaniyarama as his residence. Kund Gram is commonly associated with modern Vasokund near Vaishali.",
  },
  {
    title: "Kundalpur · Nalanda",
    text: "Near the ruins of ancient Nalanda University, a Jaisalmer-stone temple houses images of Mahavira, Adinath and Gautam Gandhara. The place is associated with Gautam Gandhara, Mahavira's first disciple, and has an older Jain temple.",
  },
  {
    title: "Jalmandir · Pawapuri",
    text: "Also called Apapuri, Pawapuri is among Jainism's most sacred pilgrimage places and is traditionally associated with Mahavira's nirvana. Jalmandir, a white-marble temple, stands in the tank said to have formed as devotees gathered the cremation ashes.",
  },
  {
    title: "Samosaran · Pawapuri",
    text: "A white-marble temple commemorates the places where Mahavira is believed to have sat and taught. Its low steps rise through concentric terraces.",
  },
  {
    title: "Maniyar Math · Rajgir",
    text: "Near the Son Bhandar caves, this monument stands within the enclosure of the ancient city. Local legend connects a well here with King Bimbisara; a small modern Jain temple is also on the site.",
  },
  {
    title: "Son Bhandar caves · Rajgir",
    text: "Two adjoining rock-cut caves on Vaibhara Hill contain Jain figures carved in relief, including images identified as Padmaprabha, Parshvanatha and Mahavira.",
  },
  {
    title: "Gonava Jee · Nawada",
    text: "About 1 km north of Nawada, Digambar and Shwetambar Jain temples mark a pilgrimage site associated with Gautam Gandhara, Mahavira's first disciple.",
  },
  {
    title: "Lachhuar · Jamui",
    text: "This pilgrimage area has Jain temples and a dharamshala built in 1874 by Rai Dhanpat Singh Bahadur of Murshidabad. Nearby hill shrines and images of Mahavira draw visitors; some Jain traditions also regard Lachhuar as Mahavira's birthplace.",
  },
  {
    title: "Bisram · Bhojpur",
    text: "Located in Arrah, Bisram is associated with Mahavira resting during his travels. Jain pilgrims visit its temple, which houses an image of Mahavira.",
  },
  {
    title: "Masadh · Bhojpur",
    text: "Around 6 km southwest of Arrah, an old Jain temple is dedicated to Parshvanath. Archaeological records date eight images to 1396 CE; the temple was completed in 1819.",
  },
  {
    title: "Mandar Hill · Banka",
    text: "About 48 km south of Bhagalpur, this roughly 700-foot granite hill is linked in the Skanda Purana with the churning of the ocean. Jain pilgrims worship Vasupujya on the summit.",
  },
  {
    title: "Champanagar / Champapuri · Bhagalpur",
    text: "Jain tradition associates Champapuri with the birth of the 12th Tirthankara, Vasupujya, and remembers Mahavira staying in the area during his travels. Jain temples and sacred footprints are among the local sites.",
  },
  {
    title: "Kundghat · Jamui",
    text: "Around 6 km from Lachhuar, Kundghat is considered sacred by Jains and is home to the temple of Kundeshwari Devi.",
  },
];

const biharRamayanaPlaces = [
  {
    title: "Janaki Temple · Punaura, Sitamarhi",
    text: "About 5 km southwest of Sitamarhi, this sacred temple is traditionally revered as the birthplace of Sita.",
  },
  {
    title: "Janaki Temple · Sitamarhi",
    text: "A more than century-old temple near Sitamarhi is also associated with the life and birthplace of Sita.",
  },
  {
    title: "Panth Pakar · Sitamarhi",
    text: "An ancient banyan tree, about 8 km northeast of Sitamarhi, is said to be where Sita rested in her palanquin on the journey to Ayodhya after her wedding to Ram.",
  },
  {
    title: "Haleshwar Sthan · Sitamarhi",
    text: "This ancient Shiva temple, about 3 km northwest of Sitamarhi, is linked by tradition to King Janak and a Putreshti yajna.",
  },
  {
    title: "Ahilya Sthan · Darbhanga",
    text: "About 24 km northwest of Darbhanga and 4 km from Kamtaul station, the temple is associated with the story of sage Gautam and Ahilya. A stone footprint is an object of worship.",
  },
  {
    title: "Chanki Garh / Janaki Garh · West Champaran",
    text: "This village near Ramnagar has a large brick mound, about 90 feet high, with remains of fortifications. Local tradition remembers it as a fort of King Janak.",
  },
  {
    title: "Valmiki Nagar · West Champaran",
    text: "Near the India–Nepal border, Valmiki Nagar is home to an ashram associated with Maharshi Valmiki. A fair is held on the Gandak riverbank around Makar Sankranti.",
  },
  {
    title: "Singheshwar Sthan · Madhepura",
    text: "An ancient Shiva pilgrimage site associated with Rishi Shringi and his father Vibhandak. Local tradition describes the area as a forest retreat for meditation.",
  },
  {
    title: "Phullaha · Madhubani",
    text: "About 6 km west of Umgaon, the village has a temple to Goddess Girija. Tradition says Sita worshipped here and Ram first saw her at this place.",
  },
  {
    title: "Pretshila Hills · Gaya",
    text: "About 8 km northwest of Gaya, this 873-foot hill has a small temple at its summit associated with Yama, the god of death.",
  },
  {
    title: "Kako · Jehanabad",
    text: "Around 10 km east of Jehanabad station, local tradition links the village's name to Rani Kaikeyi. The village is also known for the tomb of Bibi Kamal Sahiba.",
  },
  {
    title: "Rainchura · Vaishali",
    text: "A Ram Navami fair is held here. Local tradition says Ram stopped for a bath on his way to Janakpur; marks on a stone are believed to be his footprints.",
  },
  {
    title: "Ahirauli · Buxar",
    text: "This village is associated with Ram, Lakshman and sage Vishwamitra crossing the Ganga on their way to Janakpur and Sita's swayamvar.",
  },
  {
    title: "Tar · Bhojpur",
    text: "About 10 km northwest of Piro, the village is associated with the legend of Taraka, said to have been defeated by Ram. An old tank is linked with the story.",
  },
  {
    title: "Giddheshwar · Jamui",
    text: "Local legend places the battle between Jatayu and Ravana on a hill about 13 km south of Jamui. A Shiva temple draws pilgrims during Shivratri and Maghi Purnima.",
  },
  {
    title: "Sita Kund · Munger",
    text: "About 6 km east of Munger, this hot spring is associated with the Ramayana episode of Sita's trial by fire. Pilgrims especially visit on the full moon of Magh.",
  },
];

export default function Blog() {
  const [activeTopic, setActiveTopic] = useState("parsili");
  const topics = [
    { id: "parsili", label: "Parsili", detail: "Nature & wildlife" },
    { id: "chitrakoot", label: "Chitrakoot", detail: "Pilgrimage guide" },
    { id: "jain", label: "Jain Bihar", detail: "Sacred places" },
    { id: "ramayana", label: "Ramayana Bihar", detail: "Places & legends" },
  ];

  return (
    <>
      <PageIntro label="Travel journal · India" title="Stories & sacred places" />
      <nav className="blog-topic-nav container" aria-label="Choose a travel story">
        {topics.map((topic) => (
          <button
            aria-pressed={activeTopic === topic.id}
            className={activeTopic === topic.id ? "blog-topic-option is-active" : "blog-topic-option"}
            key={topic.id}
            onClick={() => setActiveTopic(topic.id)}
            type="button"
          >
            <strong>{topic.label}</strong>
            <span>{topic.detail}</span>
          </button>
        ))}
      </nav>
      <p className="blog-topic-hint container">Choose a topic to explore its guide.</p>
      <div className="blog-topic-panel" hidden={activeTopic !== "parsili"}>
      <article className="blog-article container">
        <header className="blog-article-intro">
          <Eyebrow>A riverside escape</Eyebrow>
          <p>
            Parsili is an idyllic place in Sidhi district with more to discover
            than first meets the eye. Situated on the bank of the Banas River,
            this unspoilt destination is 10 km from Sanjay-Dubri National Park,
            where a passion for wildlife can be paired with a leisurely break.
            Parsili is also a haven for bird lovers. Herons, egrets, white-necked
            storks, white ibises, whistling teals, kites, eagles, harriers,
            kingfishers and orioles are among the birds found here.
          </p>
          <div className="blog-article-facts" aria-label="About Parsili">
            <div><span>District</span><strong>Sidhi, Madhya Pradesh</strong></div>
            <div><span>By the river</span><strong>Banas River</strong></div>
            <div><span>Nearby</span><strong>Sanjay-Dubri National Park · 10 km</strong></div>
          </div>
        </header>

        <div className="blog-article-body">
          <section aria-labelledby="barefoot-trek-heading">
            <Eyebrow>Walk, watch, wander</Eyebrow>
            <h2 id="barefoot-trek-heading">The barefoot trek</h2>
            <p>
              The walk starts at around 6:00 a.m., amid magnificent green
              surroundings and the mellow rays of the rising sun, led by a
              naturalist. Parsili Resort provides a small backpack with a water
              bottle, fruit and sandwiches for an en-route breakfast as you
              explore the surrounding flora and birdlife at your own pace.
            </p>
            <p>
              The landscape is dotted with sand dunes and lush green vegetation.
              Sunlight filters through hillocks, clouds and trees, making you
              reach for your camera again and again. The 4 km trek takes about
              two to three hours and ends at the rustic Kathbungalow, an old
              wooden haveli with a sprawling garden and mango trees along the
              river. Spend some time at this charming place, then walk back or
              take a vehicle to the resort.
            </p>
          </section>

          <aside className="blog-article-note">
            <Icon name="compass" size={22} />
            <div>
              <h3>What to wear and bring</h3>
              <p>
                Wear comfortable trousers or pants that are easy to move in and
                suitable for wading through water. Bring a cap and binoculars.
              </p>
            </div>
          </aside>

          <section aria-labelledby="national-park-heading">
            <Eyebrow>Wildlife &amp; forests</Eyebrow>
            <h2 id="national-park-heading">Sanjay-Dubri National Park</h2>
            <p>
              The park is only 10 km from Parsili. With a little luck, you may
              spot a chital, jackal or peacock. The reserve includes Dubri
              Sanctuary and Sanjay National Park, with Guru Ghasidas National
              Park forming its southern boundary. These luxuriant forests,
              dominated by sal, dhawda and semal trees, merge with the forests
              of Bandhavgarh National Park.
            </p>
            <p>
              The forests of Sanjay-Dubri protect the watershed formed by the
              Son River and its tributaries, and provide a home to many species
              of waterbirds. Spread across Sidhi and Singrauli districts, the
              forests are home to approximately 300 varieties of birds. Gopad
              Darshan, Ram Daha Kund, Giddha Pahad and Barchar Dam are among
              the places to visit inside the national park. Nature walks and
              cycling trails offer other ways to explore.
            </p>
          </section>

          <blockquote className="blog-article-quote">
            “Each time my feet touched the earth, I knew my mother was there
            with me. I knew this body was not mine, but a living continuation
            of my mother and all my ancestors. These feet I saw as ‘my feet’
            were actually ‘our’ feet. Together, my mother and I were leaving
            footprints on damp soil.”
          </blockquote>
        </div>

        <footer className="blog-article-footer">
          <p>Discover more places and journeys across India with our local team.</p>
          <Link className="text-link" to="/destinations-in-india">
            Explore destinations <Icon />
          </Link>
        </footer>
      </article>
      </div>
      <div className="blog-topic-panel" hidden={activeTopic !== "chitrakoot"}>
      <article className="blog-article blog-article-secondary container" aria-labelledby="chitrakoot-heading">
        <header className="blog-article-intro">
          <Eyebrow>Pilgrimage · Uttar Pradesh &amp; Madhya Pradesh</Eyebrow>
          <h2 id="chitrakoot-heading">Chitrakoot: a landscape of faith and legend</h2>
          <p>
            Chitrakoot is a revered pilgrimage destination whose name is often
            understood through the words “chitra” (colourful) and “koot” (hill).
            The Mandakini and Payaswini rivers shape its natural setting. The
            region is deeply connected with the Ramayana: tradition says Lord
            Shri Ram spent part of his fourteen-year exile here. Sages including
            Maharishi Atri are also associated with its forests and ashrams.
          </p>
          <div className="blog-article-facts" aria-label="Chitrakoot travel information">
            <div><span>Area</span><strong>38.2 sq km</strong></div>
            <div><span>Elevation</span><strong>About 207 metres</strong></div>
            <div><span>Best season</span><strong>July to March</strong></div>
            <div><span>Languages</span><strong>Hindi, Bundeli and English</strong></div>
            <div><span>Local transport</span><strong>Rickshaw, auto and taxi</strong></div>
            <div><span>Clothing</span><strong>Cottons in summer; woollens in winter</strong></div>
          </div>
          <p className="blog-article-smallprint">
            Population: 990,526 (2011 census figure supplied with the source
            material; the administrative area for this figure may differ from
            the destination itself). STD codes listed in the source:
            05198 (Uttar Pradesh) and 07670 (Madhya Pradesh).
          </p>
        </header>

        <div className="blog-article-body">
          <section aria-labelledby="chitrakoot-getting-there">
            <Eyebrow>Plan your route</Eyebrow>
            <h2 id="chitrakoot-getting-there">Getting to Chitrakoot</h2>
            <div className="blog-article-transport">
              <div>
                <h3>By air</h3>
                <p>Bamrauli Airport, Prayagraj (Allahabad), is approximately 145 km away.</p>
              </div>
              <div>
                <h3>By rail</h3>
                <p>Chitrakoot Dham–Karwi is about 10 km away. Other railheads listed in the source are Manikpur (35 km), Banda (70 km), Mahoba (127 km), Prayagraj (127 km) and Khajuraho (185 km).</p>
              </div>
              <div>
                <h3>By road</h3>
                <p>Karvi bus station is about 8 km away. The source also lists Satna (70 km), Banda (70 km), Kalinjar (88 km), Prayagraj (130 km), Khajuraho (135 km), Jhansi (274 km) and Lucknow (285 km).</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="chitrakoot-places">
            <Eyebrow>Temples, riverbanks &amp; forest paths</Eyebrow>
            <h2 id="chitrakoot-places">Places to visit</h2>
            <div className="blog-article-place-grid">
              {chitrakootHighlights.map((place) => (
                <article key={place.title}>
                  <h3>{place.title}</h3>
                  <p>{place.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="chitrakoot-nearby">
            <Eyebrow>Extend your journey</Eyebrow>
            <h2 id="chitrakoot-nearby">Places near Chitrakoot Dham</h2>
            <div className="blog-article-place-grid blog-article-nearby-grid">
              {nearbyChitrakootPlaces.map((place) => (
                <article key={place.title}>
                  <h3>{place.title}</h3>
                  <p>{place.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="chitrakoot-when-to-visit">
            <Eyebrow>Local calendar</Eyebrow>
            <h2 id="chitrakoot-when-to-visit">Fairs and festivals</h2>
            <div className="blog-article-festival-list">
              {chitrakootFestivals.map(([name, season]) => (
                <div key={name}><strong>{name}</strong><span>{season}</span></div>
              ))}
            </div>
          </section>

          <aside className="blog-article-note">
            <Icon name="pin" size={22} />
            <div>
              <h3>Medical services</h3>
              <ul>
                <li>Upgraded Health Centre, Sitapur</li>
                <li>U.P. Sadguru Seva Sangh, Janaki Kund, Madhya Pradesh</li>
                <li>District Hospital, Karvi–Tejipur</li>
                <li>Ramkripa Chikitsalaya, Handicapped University, Chitrakoot</li>
              </ul>
            </div>
          </aside>

          <section aria-labelledby="chitrakoot-stays">
            <Eyebrow>Stay in the pilgrimage area</Eyebrow>
            <h2 id="chitrakoot-stays">Accommodation</h2>
            <p>
              The following guest houses and lodges were listed in the supplied
              information. Please confirm current availability, facilities and
              contact details directly before travel.
            </p>
            <ul className="blog-article-lodging-list">
              {chitrakootLodging.map((place) => <li key={place}>{place}</li>)}
            </ul>
            <a className="text-link" href="tel:+919319140846">
              Call Eternal India for travel assistance · +91 93191 40846 <Icon />
            </a>
          </section>
        </div>
      </article>
      </div>
      <div className="blog-topic-panel" hidden={activeTopic !== "jain"}>
      <section className="blog-sacred-section" aria-labelledby="bihar-sacred-heading">
        <div className="blog-sacred-inner container blog-sacred-single">
          <div className="blog-sacred-heading">
            <Eyebrow>Sacred routes · Bihar</Eyebrow>
            <h2 id="bihar-sacred-heading">Jain pilgrimage in Bihar</h2>
            <p>
              Bihar is closely connected with Jain history and pilgrimage.
              Tradition associates Pawapuri with Mahavira's nirvana and
              Champapuri with the birth of the 12th Tirthankara, Vasupujya.
            </p>
          </div>

          <div className="blog-sacred-disclosures">
            <details className="blog-sacred-disclosure" open>
              <summary>
                <span>
                  <strong>Jain pilgrimage in Bihar</strong>
                  <small>From Pawapuri and Rajgir to Champapuri and Lachhuar</small>
                </span>
                <span className="blog-sacred-count">{biharJainPlaces.length} places</span>
              </summary>
              <div className="blog-sacred-place-grid">
                {biharJainPlaces.map((place) => (
                  <article key={place.title}>
                    <h3>{place.title}</h3>
                    <p>{place.text}</p>
                  </article>
                ))}
              </div>
            </details>

          </div>
        </div>
      </section>
      </div>
      <div className="blog-topic-panel" hidden={activeTopic !== "ramayana"}>
        <section className="blog-sacred-section" aria-labelledby="bihar-ramayana-heading">
          <div className="blog-sacred-inner container blog-sacred-single">
            <div className="blog-sacred-heading">
              <Eyebrow>Sacred routes · Bihar</Eyebrow>
              <h2 id="bihar-ramayana-heading">Ramayana places in Bihar</h2>
              <p>
                Explore temples, ashrams and landmarks connected by local
                tradition with Ram and Sita.
              </p>
            </div>
            <div className="blog-sacred-disclosures">
              <details className="blog-sacred-disclosure" open>
                <summary>
                  <span>
                    <strong>Places &amp; legends</strong>
                    <small>From Sitamarhi and Darbhanga to Buxar and Munger</small>
                  </span>
                  <span className="blog-sacred-count">{biharRamayanaPlaces.length} places</span>
                </summary>
                <div className="blog-sacred-place-grid">
                  {biharRamayanaPlaces.map((place) => (
                    <article key={place.title}>
                      <h3>{place.title}</h3>
                      <p>{place.text}</p>
                    </article>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
