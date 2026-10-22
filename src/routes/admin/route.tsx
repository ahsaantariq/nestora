import { Outlet, createFileRoute } from "@tanstack/react-router";
import { DeskLink, Workspace } from "@/components/workspace";

export const Route = createFileRoute("/admin")({
  component: function AdminLayout() {
    return (
      <Workspace
        allow={["ADMIN"]}
        nav={
          <>
            <DeskLink to="/admin" exact>Overview</DeskLink>
            <DeskLink to="/admin/listings">Listing review</DeskLink>
            <DeskLink to="/admin/owners">Owners</DeskLink>
            <DeskLink to="/admin/customers">Customers</DeskLink>
            <DeskLink to="/admin/bookings">Bookings</DeskLink>
            <DeskLink to="/admin/payments">Payments</DeskLink>
            <DeskLink to="/admin/payouts">Payouts</DeskLink>
            <DeskLink to="/admin/fees">Fees & settings</DeskLink>
            <DeskLink to="/admin/reports">Reports</DeskLink>
          </>
        }
      >
        <Outlet />
      </Workspace>
    );
  },
});
