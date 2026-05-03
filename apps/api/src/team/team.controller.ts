import { Controller, Get, Delete, Param, Req } from "@nestjs/common";
import { TeamService } from "./team.service";

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
}
