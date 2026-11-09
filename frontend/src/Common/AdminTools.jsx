import JourneyVoucher from "./JourneyVoucher";
import HotelManager from "./HotelManager";
import "./AdminTools.css";
export default function AdminTools(props) { return props.tool === "hotels" ? <HotelManager {...props} /> : <JourneyVoucher {...props} />; }
