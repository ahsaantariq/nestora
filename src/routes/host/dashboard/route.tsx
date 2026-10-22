import { Outlet, createFileRoute } from "@tanstack/react-router";
import { DeskLink, Workspace } from "@/components/workspace";

export const Route = createFileRoute("/host/dashboard")({
  component: function HostLayout() {
    return (
      <Workspace
        allow={["OWNER", "ADMIN"]}
        nav={
          <>
            <DeskLink to="/host/dashboard" exact>Dashboard</DeskLink>
            <DeskLink to="/host/dashboard/properties">Properties</DeskLink>
            <DeskLink to="/host/dashboard/rooms">Rooms / units</DeskLink>
            <DeskLink to="/host/dashboard/calendar">Calendar</DeskLink>
            <DeskLink to="/host/dashboard/bookings">Bookings</DeskLink>
            <DeskLink to="/host/dashboard/payouts">Payouts</DeskLink>
            <DeskLink to="/host/dashboard/fees">Subscription & fees</DeskLink>
            <DeskLink to="/host/dashboard/reviews">Reviews</DeskLink>
            <DeskLink to="/host/dashboard/settings">Settings</DeskLink>
            <DeskLink to="/host/dashboard/security">Security</DeskLink>
          </>
        }
      >
        <Outlet />
      </Workspace>
    );
  },
});
