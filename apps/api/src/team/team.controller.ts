import { Controller, Get, Post, Delete, Param, Req, Body } from "@nestjs/common";
import { SetMetadata } from "@nestjs/common";
import { TeamService } from "./team.service";

// Mark an endpoint as publicly accessible (no Clerk JWT required)
const Public = () => SetMetadata("isPublic", true);

@Controller("team")
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  listMembers(@Req() req: any) {
    return this.teamService.listMembers(req.orgId);
  }

  @Delete(":id")
  removeMember(@Req() req: any, @Param("id") id: string) {
    return this.teamService.removeMember(req.orgId, id);
  }

  @Post("invite")
  inviteMember(
    @Req() req: any,
    @Body("email") email: string,
    @Body("role") role: string
  ) {
    return this.teamService.inviteMember(req.orgId, email, role);
  }

  @Public()
  @Post("accept")
  acceptInvite(
    @Req() req: any,
    @Body("token") token: string
  ) {
    return this.teamService.acceptInvite(token, req.userId);
  }
}
