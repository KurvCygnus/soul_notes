package kurvcygnus.soulnotes;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jetbrains.annotations.NotNull;

@Path("/hello")
public final class ExampleResource
{
    @GET @Produces(MediaType.TEXT_PLAIN) public @NotNull String hello() { return "Hello from Quarkus REST"; }
}
