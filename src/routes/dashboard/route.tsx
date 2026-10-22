import { Outlet, createFileRoute } from "@tanstack/react-router";
import { DeskLink, Workspace } from "@/components/workspace";

export const Route = createFileRoute("/dashboard")({
  component: function DashboardLayout() {
    return (
      <Workspace
        allow={["CUSTOMER", "OWNER", "ADMIN"]}
        nav={
          <>
            <DeskLink to="/dashboard" exact>Overview</DeskLink>
            <DeskLink to="/dashboard/bookings">My bookings</DeskLink>
            <DeskLink to="/dashboard/cards">Saved cards</DeskLink>
            <DeskLink to="/dashboard/saved">Saved properties</DeskLink>
            <DeskLink to="/dashboard/notifications">Notifications</DeskLink>
            <DeskLink to="/dashboard/profile">Profile</DeskLink>
          </>
        }
      >
        <Outlet />
      </Workspace>
    );
  },
});
