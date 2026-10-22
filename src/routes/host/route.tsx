import { Outlet, createFileRoute } from "@tanstack/react-router";
import { DeskLink, Workspace } from "@/components/workspace";

export const Route = createFileRoute("/host")({
  component: function HostLayout() {
    return (
      <Workspace
        allow={["OWNER", "ADMIN"]}
        nav={
          <>
            <DeskLink to="/host" exact>Dashboard</DeskLink>
            <DeskLink to="/host/properties">Properties</DeskLink>
            <DeskLink to="/host/rooms">Rooms / units</DeskLink>
            <DeskLink to="/host/calendar">Calendar</DeskLink>
            <DeskLink to="/host/bookings">Bookings</DeskLink>
            <DeskLink to="/host/payouts">Payouts</DeskLink>
            <DeskLink to="/host/fees">Subscription & fees</DeskLink>
            <DeskLink to="/host/reviews">Reviews</DeskLink>
            <DeskLink to="/host/settings">Settings</DeskLink>
          </>
        }
      >
        <Outlet />
      </Workspace>
    );
  },
});
